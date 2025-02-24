import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Game, GameRound, PlayerAction } from './game.entity';
import { Player } from '../players/player.entity';
import { Logger } from '@nestjs/common';
import { Deck } from './deck';

@Injectable()
export class GamesService {
  private readonly logger = new Logger(GamesService.name);
  private gameDecks: Map<number, Deck> = new Map();

  constructor(
    @InjectRepository(Game)
    private gamesRepository: Repository<Game>,
    @InjectRepository(Player)
    private playersRepository: Repository<Player>,
  ) {}

  private initializeDeck(gameId: number) {
    const deck = new Deck();
    this.gameDecks.set(gameId, deck);
  }

  async createGame(smallBlind: number, bigBlind: number): Promise<Game> {
    const game = new Game();
    game.smallBlind = smallBlind;
    game.bigBlind = bigBlind;
    game.isActive = true;
    game.playerStates = [];
    game.communityCards = [];
    const gameId = await this.gamesRepository.save(game).then(g => g.gameID);
    this.initializeDeck(gameId);
    return game;
  }

  async joinGame(gameId: number, playerId: number): Promise<Game> {
    const game = await this.gamesRepository.findOne({ 
      where: { gameID: gameId },
      relations: ['players']
    });
    if (!game) throw new NotFoundException('Game not found');
    if (!game.isActive) throw new BadRequestException('Game is not active');
    if (game.players.length >= 9) throw new BadRequestException('Game is full');

    const player = await this.playersRepository.findOne({ where: { id: playerId } });
    if (!player) throw new NotFoundException('Player not found');

    game.players.push(player);
    game.playerStates.push({
      playerId: player.id,
      position: game.players.length - 1,
      cards: [],
      currentBet: 0,
      chips: player.chips,
      hasFolded: false,
      isAllIn: false,
      lastAction: PlayerAction.FOLD
    });

    return this.gamesRepository.save(game);
  }

  async startRound(gameId: number): Promise<Game> {
    const game = await this.gamesRepository.findOne({ where: { gameID: gameId } });
    if (!game) throw new NotFoundException('Game not found');
    if (game.players.length < 2) throw new BadRequestException('Not enough players');

    const deck = this.gameDecks.get(gameId);
    if (!deck) throw new Error('Deck not initialized');
    
    // Deal cards to players
    game.playerStates.forEach((state, index) => {
      const card1 = deck.drawCard();
      const card2 = deck.drawCard();
      if (!card1 || !card2) {
        throw new Error('Deck is empty, cannot deal cards');
      }
      state.cards = [card1, card2];
      state.hasFolded = false;
      state.currentBet = 0;
      state.lastAction = PlayerAction.FOLD;
    });

    // Set initial game state
    game.currentRound = GameRound.PREFLOP;
    game.pot = 0;
    game.currentBet = game.bigBlind;
    game.communityCards = [];

    // Post blinds
    const sbPos = (game.dealerPosition + 1) % game.players.length;
    const bbPos = (game.dealerPosition + 2) % game.players.length;
    
    game.playerStates[sbPos].currentBet = game.smallBlind;
    game.playerStates[sbPos].chips -= game.smallBlind;
    
    game.playerStates[bbPos].currentBet = game.bigBlind;
    game.playerStates[bbPos].chips -= game.bigBlind;

    game.pot = game.smallBlind + game.bigBlind;

    return this.gamesRepository.save(game);
  }

  async handlePlayerAction(
    gameId: number,
    playerId: number,
    action: PlayerAction,
    amount?: number
  ): Promise<Game> {
    const game = await this.gamesRepository.findOne({ where: { gameID: gameId } });
    if (!game) {
      throw new NotFoundException('Game not found');
    }

    const playerState = game.playerStates.find(ps => ps.playerId === playerId);
    if (!playerState) {
      throw new NotFoundException('Player not in game');
    }

    switch (action) {
      case PlayerAction.FOLD:
        playerState.hasFolded = true;
        break;

      case PlayerAction.CHECK:
        if (game.currentBet > playerState.currentBet) {
          throw new BadRequestException('Cannot check when there are active bets');
        }
        break;

      case PlayerAction.CALL:
        const callAmount = game.currentBet - playerState.currentBet;
        playerState.currentBet = game.currentBet;
        game.pot += callAmount;
        break;

      case PlayerAction.RAISE:
        if (!amount || amount <= game.currentBet) {
          throw new BadRequestException('Invalid raise amount');
        }
        game.currentBet = amount;
        const raiseAmount = amount - playerState.currentBet;
        playerState.currentBet = amount;
        game.pot += raiseAmount;
        break;

      case PlayerAction.ALL_IN:
        const allInAmount = playerState.chips;
        playerState.currentBet += allInAmount;
        game.pot += allInAmount;
        playerState.chips = 0;
        playerState.isAllIn = true;
        if (playerState.currentBet > game.currentBet) {
          game.currentBet = playerState.currentBet;
        }
        break;
    }

    // Check if round is complete
    if (this.isRoundComplete(game)) {
      await this.progressToNextRound(gameId);
    }

    return this.gamesRepository.save(game);
  }

  private isRoundComplete(game: Game): boolean {
    const activePlayers = game.playerStates.filter(ps => !ps.hasFolded);
    const allPlayersActed = activePlayers.every(
      ps => ps.hasFolded || ps.currentBet === game.currentBet || ps.chips === 0
    );
    return allPlayersActed;
  }

  public async progressToNextRound(gameId: number): Promise<Game> {
    const game = await this.gamesRepository.findOne({ where: { gameID: gameId } });
    if (!game) {
      throw new NotFoundException('Game not found');
    }

    await this.progressToNextRoundHelper(game);
    return this.gamesRepository.save(game);
  }

  private async progressToNextRoundHelper(game: Game) {
    const rounds = Object.values(GameRound);
    const currentIndex = rounds.indexOf(game.currentRound);
    
    if (currentIndex < rounds.length - 1) {
      game.currentRound = rounds[currentIndex + 1];
      
      // Deal community cards based on the round
      switch (game.currentRound) {
        case GameRound.FLOP:
          game.communityCards = game.communityCards.concat(this.dealCards(game, 3));
          break;
        case GameRound.TURN:
        case GameRound.RIVER:
          game.communityCards = game.communityCards.concat(this.dealCards(game, 1));
          break;
        case GameRound.SHOWDOWN:
          await this.handleShowdown(game);
          break;
      }

      // Reset betting for the new round
      game.currentBet = 0;
      game.playerStates.forEach(ps => {
        if (!ps.hasFolded) {
          ps.currentBet = 0;
        }
      });
    }
  }

  private async handleShowdown(game: Game) {
    const activePlayers = game.playerStates.filter(ps => !ps.hasFolded);
    if (activePlayers.length === 1) {
      // Single player remaining wins the pot
      const winner = activePlayers[0];
      winner.chips += game.pot;
      game.pot = 0;
      return;
    }

    // Evaluate hands and determine winner(s)
    const winners = this.evaluateHands(game);
    const potPerWinner = Math.floor(game.pot / winners.length);
    winners.forEach(winner => {
      const playerState = game.playerStates.find(ps => ps.playerId === winner.playerId);
      if (playerState) {
        playerState.chips += potPerWinner;
      }
    });
    game.pot = 0;
  }

  private evaluateHands(game: Game): Array<{ playerId: number; handRank: number }> {
    // Implement poker hand evaluation logic here
    // Return array of winners with their hand ranks
    return [];
  }

  private dealCards(game: Game, numCards: number): string[] {
    const deck = this.gameDecks.get(game.gameID);
    if (!deck) throw new Error('Deck not initialized');
    const cards: string[] = [];
    for (let i = 0; i < numCards; i++) {
      cards.push(deck.drawCard());
    }
    return cards;
  }

  async endGame(gameId: number): Promise<void> {
    const game = await this.gamesRepository.findOne({ where: { gameID: gameId } });
    if (!game) throw new NotFoundException('Game not found');
    
    game.isActive = false;
    await this.gamesRepository.save(game);
    this.logger.log(`Game ${gameId} ended`);
  }
}
