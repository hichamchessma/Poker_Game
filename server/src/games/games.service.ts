import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Game, GameRound, PlayerAction, BettingStructure } from './game.entity';
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

  async createGame(
    smallBlind: number, 
    bigBlind: number, 
    bettingStructure: BettingStructure = BettingStructure.NO_LIMIT
  ): Promise<Game> {
    const game = new Game();
    game.smallBlind = smallBlind;
    game.bigBlind = bigBlind;
    game.bettingStructure = bettingStructure;
    game.isActive = true;
    game.playerStates = [];
    game.communityCards = [];
    game.sidePots = [];
    game.mainPot = 0;
    game.maxBet = bettingStructure === BettingStructure.FIXED_LIMIT ? bigBlind : 0;
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
    const game = await this.findGame(gameId);
    
    // Initialize or rotate dealer position
    if (game.dealerPosition === undefined) {
      game.dealerPosition = 0;
    } else {
      game.dealerPosition = (game.dealerPosition + 1) % game.playerStates.length;
    }

    // Reset game state for new round
    game.currentRound = GameRound.PREFLOP;
    game.pot = 0;
    game.currentBet = 0;
    game.communityCards = [];
    
    // Reset player states
    game.playerStates.forEach(ps => {
      ps.cards = [];
      ps.currentBet = 0;
      ps.hasFolded = false;
    });

    // Post blinds
    const sbPos = (game.dealerPosition + 1) % game.playerStates.length;
    const bbPos = (game.dealerPosition + 2) % game.playerStates.length;
    
    const sbPlayer = game.playerStates[sbPos];
    const bbPlayer = game.playerStates[bbPos];

    // Handle small blind
    const sbAmount = Math.min(game.smallBlind, sbPlayer.chips);
    sbPlayer.chips -= sbAmount;
    sbPlayer.currentBet = sbAmount;
    game.pot += sbAmount;

    // Handle big blind
    const bbAmount = Math.min(game.bigBlind, bbPlayer.chips);
    bbPlayer.chips -= bbAmount;
    bbPlayer.currentBet = bbAmount;
    game.pot += bbAmount;
    game.currentBet = bbAmount;

    // Set starting player (UTG - Under the Gun)
    game.currentPlayer = (game.dealerPosition + 3) % game.playerStates.length;

    // Initialize deck and deal cards
    this.initializeDeck(gameId);
    this.dealInitialCards(game);

    await this.gamesRepository.save(game);
    return game;
  }

  async progressToNextRound(gameId: number): Promise<Game> {
    const game = await this.findGame(gameId);
    
    // Reset betting for new round
    game.currentBet = 0;
    game.playerStates.forEach(ps => {
      if (!ps.hasFolded) ps.currentBet = 0;
    });

    // Check if only one player remains
    const activePlayers = game.playerStates.filter(ps => !ps.hasFolded);
    if (activePlayers.length === 1) {
      await this.handleShowdown(game);
      return this.gamesRepository.save(game);
    }

    // Progress through rounds
    switch (game.currentRound) {
      case GameRound.PREFLOP:
        game.currentRound = GameRound.FLOP;
        this.dealCommunityCards(game);
        break;
      case GameRound.FLOP:
        game.currentRound = GameRound.TURN;
        this.dealCommunityCards(game);
        break;
      case GameRound.TURN:
        game.currentRound = GameRound.RIVER;
        this.dealCommunityCards(game);
        break;
      case GameRound.RIVER:
        game.currentRound = GameRound.SHOWDOWN;
        await this.handleShowdown(game);
        break;
    }

    // Set first active player after dealer as starting player
    if (game.currentRound !== GameRound.SHOWDOWN) {
      let nextPlayer = (game.dealerPosition + 1) % game.playerStates.length;
      while (game.playerStates[nextPlayer].hasFolded) {
        nextPlayer = (nextPlayer + 1) % game.playerStates.length;
        if (nextPlayer === game.currentPlayer) break;
      }
      game.currentPlayer = nextPlayer;
    }

    await this.gamesRepository.save(game);
    return game;
  }

  private dealInitialCards(game: Game): void {
    // Deal 2 cards to each player
    game.playerStates.forEach(playerState => {
      playerState.cards = this.dealCards(game, 2);
    });
  }

  private dealCards(game: Game, numCards: number): string[] {
    const deck = this.gameDecks.get(game.gameID);
    if (!deck) throw new Error('Deck not initialized');
    return deck.dealCards(numCards).map(card => `${card.rank}${card.suit}`);
  }

  async handlePlayerAction(
    gameId: number,
    playerId: number,
    action: PlayerAction,
    amount?: number
  ): Promise<Game> {
    const game = await this.findGame(gameId);
    const playerState = game.playerStates.find(ps => ps.playerId === playerId);
    
    if (!playerState) throw new BadRequestException('Player not in game');
    if (playerState.hasFolded) throw new BadRequestException('Player has folded');
    if (game.currentPlayer !== playerState.position) throw new BadRequestException('Not player\'s turn');

    const maxBet = this.calculateMaxBet(game, game.currentBet);

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
        if (callAmount > playerState.chips) {
          // Player goes all-in
          game.pot += playerState.chips;
          playerState.currentBet += playerState.chips;
          playerState.chips = 0;
          playerState.isAllIn = true;
        } else {
          game.pot += callAmount;
          playerState.chips -= callAmount;
          playerState.currentBet = game.currentBet;
        }
        break;

      case PlayerAction.RAISE:
        if (!amount || amount <= game.currentBet) {
          throw new BadRequestException('Invalid raise amount');
        }
        if (amount > maxBet) {
          throw new BadRequestException(`Raise amount exceeds maximum bet of ${maxBet}`);
        }
        if (amount > playerState.chips + playerState.currentBet) {
          throw new BadRequestException('Not enough chips');
        }
        const raiseAmount = amount - playerState.currentBet;
        game.currentBet = amount;
        game.pot += raiseAmount;
        playerState.chips -= raiseAmount;
        playerState.currentBet = amount;
        break;

      case PlayerAction.ALL_IN:
        const allInAmount = playerState.chips + playerState.currentBet;
        if (allInAmount > game.currentBet) {
          game.currentBet = allInAmount;
        }
        game.pot += playerState.chips;
        playerState.currentBet += playerState.chips;
        playerState.chips = 0;
        playerState.isAllIn = true;
        break;
    }

    playerState.lastAction = action;
    this.updatePots(game);

    if (this.isRoundComplete(game)) {
      await this.progressToNextRound(gameId);
    } else {
      this.moveToNextPlayer(game);
    }

    await this.gamesRepository.save(game);
    return game;
  }

  private calculateMaxBet(game: Game, currentBet: number): number {
    switch (game.bettingStructure) {
      case BettingStructure.NO_LIMIT:
        return Number.MAX_SAFE_INTEGER;
      case BettingStructure.POT_LIMIT:
        return game.mainPot + game.sidePots.reduce((sum, pot) => sum + pot.amount, 0) + currentBet * 2;
      case BettingStructure.FIXED_LIMIT:
        return game.maxBet;
      default:
        return Number.MAX_SAFE_INTEGER;
    }
  }

  private updatePots(game: Game): void {
    // Sort players by their current bet, from lowest to highest
    const sortedPlayers = [...game.playerStates]
      .filter(ps => !ps.hasFolded)
      .sort((a, b) => a.currentBet - b.currentBet);

    let processedBet = 0;
    game.sidePots = [];
    game.mainPot = 0;

    // Create side pots for each all-in player
    for (let i = 0; i < sortedPlayers.length; i++) {
      const currentPlayer = sortedPlayers[i];
      const currentBet = currentPlayer.currentBet - processedBet;
      
      if (currentBet > 0) {
        const eligiblePlayers = sortedPlayers.slice(i).map(p => p.playerId);
        const potAmount = currentBet * eligiblePlayers.length;
        
        if (i === 0) {
          game.mainPot = potAmount;
        } else {
          game.sidePots.push({
            amount: potAmount,
            eligiblePlayers
          });
        }
        processedBet = currentPlayer.currentBet;
      }
    }
  }

  private moveToNextPlayer(game: Game): void {
    let nextPosition = (game.currentPlayer + 1) % game.playerStates.length;
    while (
      game.playerStates[nextPosition].hasFolded ||
      game.playerStates[nextPosition].chips === 0
    ) {
      nextPosition = (nextPosition + 1) % game.playerStates.length;
      if (nextPosition === game.currentPlayer) break;
    }
    game.currentPlayer = nextPosition;
  }

  private isRoundComplete(game: Game): boolean {
    const activePlayers = game.playerStates.filter(ps => !ps.hasFolded);
    const allPlayersActed = activePlayers.every(
      ps => ps.hasFolded || ps.currentBet === game.currentBet || ps.chips === 0
    );
    return allPlayersActed;
  }

  private dealCommunityCards(game: Game): void {
    switch (game.currentRound) {
      case GameRound.FLOP:
        game.communityCards = this.dealCards(game, 3);
        break;
      case GameRound.TURN:
      case GameRound.RIVER:
        game.communityCards.push(...this.dealCards(game, 1));
        break;
    }
  }

  private handleShowdown(game: Game) {
    const activePlayers = game.playerStates.filter(ps => !ps.hasFolded);
    
    // Single player wins all pots
    if (activePlayers.length === 1) {
      const winner = activePlayers[0];
      winner.chips += game.mainPot;
      game.sidePots.forEach(pot => {
        winner.chips += pot.amount;
      });
      game.mainPot = 0;
      game.sidePots = [];
      return;
    }

    // Evaluate all hands
    const playerHands = activePlayers.map(ps => {
      const allCards = [...ps.cards, ...game.communityCards];
      const { rank, handDescription, value, kickers } = this.calculateHandRank(allCards);
      return { 
        playerId: ps.playerId, 
        handRank: rank, 
        handDescription, 
        handValue: value,
        kickers 
      };
    });

    // Distribute main pot
    const mainPotWinners = this.findWinners(playerHands);
    const mainPotShare = Math.floor(game.mainPot / mainPotWinners.length);
    mainPotWinners.forEach(winner => {
      const playerState = game.playerStates.find(ps => ps.playerId === winner.playerId);
      if (playerState) {
        playerState.chips += mainPotShare;
      }
    });

    // Distribute side pots from smallest to largest
    game.sidePots.forEach(sidePot => {
      const eligibleHands = playerHands.filter(hand => 
        sidePot.eligiblePlayers.includes(hand.playerId)
      );
      const sidePotWinners = this.findWinners(eligibleHands);
      const sidePotShare = Math.floor(sidePot.amount / sidePotWinners.length);
      sidePotWinners.forEach(winner => {
        const playerState = game.playerStates.find(ps => ps.playerId === winner.playerId);
        if (playerState) {
          playerState.chips += sidePotShare;
        }
      });
    });

    // Clear pots
    game.mainPot = 0;
    game.sidePots = [];
    game.winners = playerHands;
  }

  private findWinners(hands: Array<{ playerId: number; handRank: number; handDescription: string; handValue: number; kickers: number[] }>): Array<{ playerId: number; handRank: number; handDescription: string; handValue: number; kickers: number[] }> {
    // Sort hands by rank (highest to lowest)
    hands.sort((a, b) => {
      if (b.handRank !== a.handRank) return b.handRank - a.handRank;
      if (b.handValue !== a.handValue) return b.handValue - a.handValue;
      
      // Compare kickers
      for (let i = 0; i < Math.max(a.kickers.length, b.kickers.length); i++) {
        const kickerA = a.kickers[i] || 0;
        const kickerB = b.kickers[i] || 0;
        if (kickerA !== kickerB) return kickerB - kickerA;
      }
      return 0;
    });

    // Find all hands that tie for best
    const bestHand = hands[0];
    return hands.filter(hand => 
      hand.handRank === bestHand.handRank && 
      hand.handValue === bestHand.handValue &&
      hand.kickers.every((kicker, i) => kicker === bestHand.kickers[i])
    );
  }

  private calculateHandRank(cards: string[]): { rank: number; handDescription: string; value: number; kickers: number[] } {
    const cardObjects = cards.map(card => ({
      rank: card.slice(0, -1),
      suit: card.slice(-1),
      value: this.getCardValue(card.slice(0, -1))
    }));

    // Sort cards by value in descending order
    cardObjects.sort((a, b) => b.value - a.value);

    // Check for each hand type from highest to lowest
    if (this.isRoyalFlush(cardObjects)) 
      return { rank: 10, handDescription: 'Royal Flush', value: 14, kickers: [] };
    
    if (this.isStraightFlush(cardObjects)) {
      const value = cardObjects[0].value;
      return { rank: 9, handDescription: 'Straight Flush', value, kickers: [] };
    }
    
    if (this.isFourOfAKind(cardObjects)) {
      const groups = this.groupByRank(cardObjects);
      const fourOfAKind = Object.entries(groups).find(([_, cards]) => cards.length === 4);
      const kicker = Object.entries(groups)
        .filter(([rank, _]) => rank !== fourOfAKind![0])
        .map(([_, cards]) => cards[0].value)
        .sort((a, b) => b - a)[0];
      return { 
        rank: 8, 
        handDescription: 'Four of a Kind', 
        value: this.getCardValue(fourOfAKind![0]), 
        kickers: [kicker] 
      };
    }
    
    if (this.isFullHouse(cardObjects)) {
      const groups = this.groupByRank(cardObjects);
      const threeOfAKind = Object.entries(groups).find(([_, cards]) => cards.length === 3);
      const pair = Object.entries(groups).find(([_, cards]) => cards.length === 2);
      return { 
        rank: 7, 
        handDescription: 'Full House', 
        value: this.getCardValue(threeOfAKind![0]), 
        kickers: [this.getCardValue(pair![0])] 
      };
    }
    
    if (this.isFlush(cardObjects)) {
      const values = cardObjects.map(card => card.value);
      return { 
        rank: 6, 
        handDescription: 'Flush', 
        value: values[0], 
        kickers: values.slice(1, 5) 
      };
    }
    
    if (this.isStraight(cardObjects)) {
      const values = cardObjects.map(card => card.value);
      return { 
        rank: 5, 
        handDescription: 'Straight', 
        value: values[0], 
        kickers: [] 
      };
    }
    
    if (this.isThreeOfAKind(cardObjects)) {
      const groups = this.groupByRank(cardObjects);
      const threeOfAKind = Object.entries(groups).find(([_, cards]) => cards.length === 3);
      const kickers = Object.entries(groups)
        .filter(([rank, _]) => rank !== threeOfAKind![0])
        .map(([_, cards]) => cards[0].value)
        .sort((a, b) => b - a);
      return { 
        rank: 4, 
        handDescription: 'Three of a Kind', 
        value: this.getCardValue(threeOfAKind![0]), 
        kickers 
      };
    }
    
    if (this.isTwoPair(cardObjects)) {
      const groups = this.groupByRank(cardObjects);
      const pairs = Object.entries(groups).filter(([_, cards]) => cards.length === 2);
      const pairValues = pairs.map(([rank, _]) => this.getCardValue(rank)).sort((a, b) => b - a);
      const kicker = Object.entries(groups)
        .filter(([rank, _]) => !pairs.some(([pairRank, _]) => pairRank === rank))
        .map(([_, cards]) => cards[0].value)
        .sort((a, b) => b - a)[0];
      return { 
        rank: 3, 
        handDescription: 'Two Pair', 
        value: pairValues[0], 
        kickers: [pairValues[1], kicker] 
      };
    }
    
    if (this.isPair(cardObjects)) {
      const groups = this.groupByRank(cardObjects);
      const pair = Object.entries(groups).find(([_, cards]) => cards.length === 2);
      const kickers = Object.entries(groups)
        .filter(([rank, _]) => rank !== pair![0])
        .map(([_, cards]) => cards[0].value)
        .sort((a, b) => b - a);
      return { 
        rank: 2, 
        handDescription: 'Pair', 
        value: this.getCardValue(pair![0]), 
        kickers 
      };
    }
    
    // High card
    const sortedValues = cardObjects.map(card => card.value).sort((a, b) => b - a);
    return { 
      rank: 1, 
      handDescription: 'High Card', 
      value: sortedValues[0], 
      kickers: sortedValues.slice(1, 5) 
    };
  }

  private getCardValue(rank: string): number {
    const values: { [key: string]: number } = {
      '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
      'J': 11, 'Q': 12, 'K': 13, 'A': 14
    };
    return values[rank];
  }

  private isRoyalFlush(cards: any[]): boolean {
    return this.isStraightFlush(cards) && cards[0].value === 14;
  }

  private isStraightFlush(cards: any[]): boolean {
    return this.isFlush(cards) && this.isStraight(cards);
  }

  private isFourOfAKind(cards: any[]): boolean {
    const groups = this.groupByRank(cards);
    return Object.values(groups).some(group => group.length === 4);
  }

  private isFullHouse(cards: any[]): boolean {
    const groups = this.groupByRank(cards);
    const hasThree = Object.values(groups).some(group => group.length === 3);
    const hasPair = Object.values(groups).some(group => group.length === 2);
    return hasThree && hasPair;
  }

  private isFlush(cards: any[]): boolean {
    const suits = cards.map(card => card.suit);
    return new Set(suits).size === 1;
  }

  private isStraight(cards: any[]): boolean {
    const values = [...new Set(cards.map(card => card.value))].sort((a, b) => a - b);
    if (values.length < 5) return false;
    
    // Check for Ace-low straight (A,2,3,4,5)
    if (values.includes(14)) {
      const aceLowValues = values.filter(v => v <= 5 || v === 14);
      if (aceLowValues.length >= 5) {
        const lowStraight = [14, 2, 3, 4, 5];
        if (lowStraight.every(v => values.includes(v))) return true;
      }
    }

    // Check for normal straight
    for (let i = 0; i < values.length - 4; i++) {
      if (values[i + 4] - values[i] === 4) return true;
    }
    return false;
  }

  private isThreeOfAKind(cards: any[]): boolean {
    const groups = this.groupByRank(cards);
    return Object.values(groups).some(group => group.length === 3);
  }

  private isTwoPair(cards: any[]): boolean {
    const groups = this.groupByRank(cards);
    const pairs = Object.values(groups).filter(group => group.length === 2);
    return pairs.length >= 2;
  }

  private isPair(cards: any[]): boolean {
    const groups = this.groupByRank(cards);
    return Object.values(groups).some(group => group.length === 2);
  }

  private groupByRank(cards: any[]): { [key: string]: any[] } {
    return cards.reduce((groups: any, card) => {
      const rank = card.rank;
      groups[rank] = groups[rank] || [];
      groups[rank].push(card);
      return groups;
    }, {});
  }

  async endGame(gameId: number): Promise<void> {
    const game = await this.findGame(gameId);
    if (!game) throw new NotFoundException('Game not found');
    
    game.isActive = false;
    await this.gamesRepository.save(game);
    this.logger.log(`Game ${gameId} ended`);
  }

  private async findGame(gameId: number): Promise<Game> {
    const game = await this.gamesRepository.findOne({ where: { gameID: gameId } });
    if (!game) throw new NotFoundException('Game not found');
    return game;
  }
}
