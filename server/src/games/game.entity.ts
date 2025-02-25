import { Entity, Column, PrimaryGeneratedColumn, ManyToMany, JoinTable, OneToMany } from 'typeorm';
import { Player } from '../players/player.entity';

export enum GameRound {
  PREFLOP = 'PREFLOP',
  FLOP = 'FLOP',
  TURN = 'TURN',
  RIVER = 'RIVER',
  SHOWDOWN = 'SHOWDOWN'
}

export enum PlayerAction {
  FOLD = 'FOLD',
  CHECK = 'CHECK',
  CALL = 'CALL',
  RAISE = 'RAISE',
  ALL_IN = 'ALL_IN'
}

export enum BettingStructure {
  NO_LIMIT = 'NO_LIMIT',
  POT_LIMIT = 'POT_LIMIT',
  FIXED_LIMIT = 'FIXED_LIMIT'
}

@Entity()
export class Game {
  @PrimaryGeneratedColumn()
  gameID: number;

  @Column({ type: 'enum', enum: GameRound, default: GameRound.PREFLOP })
  currentRound: GameRound;

  @Column({ type: 'json', nullable: true })
  communityCards: string[];

  @Column({ default: 0 })
  pot: number;

  @Column({ default: 0 })
  currentBet: number;

  @Column({ default: 0 })
  dealerPosition: number;

  @Column({ default: 0 })
  currentPlayer: number;

  @Column({ default: 0 })
  smallBlind: number;

  @Column({ default: 0 })
  bigBlind: number;

  @Column({ type: 'json', nullable: true })
  playerStates: {
    playerId: number;
    position: number;
    cards: string[];
    currentBet: number;
    chips: number;
    hasFolded: boolean;
    isAllIn: boolean;
    lastAction?: PlayerAction;
  }[];

  @Column({ default: false })
  isActive: boolean;

  @Column({ type: 'json', nullable: true })
  winners?: {
    playerId: number;
    handRank: number;
    handDescription: string;
    handValue: number;  // Numeric value for comparing equal hand ranks
    kickers: number[];  // Array of kicker values for tie-breaking
  }[];

  @Column({ default: 2 })
  minPlayers: number;

  @Column({ default: 9 })
  maxPlayers: number;

  @Column({ default: 1000 })
  startingChips: number;

  @Column({ type: 'enum', enum: BettingStructure, default: BettingStructure.NO_LIMIT })
  bettingStructure: BettingStructure;

  @Column({ type: 'json', nullable: true })
  sidePots: {
    amount: number;
    eligiblePlayers: number[];
  }[];

  @Column({ default: 0 })
  mainPot: number;

  @Column({ default: 0 })
  maxBet: number;  // Used for POT_LIMIT and FIXED_LIMIT

  @ManyToMany(() => Player)
  @JoinTable()
  players: Player[];

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
