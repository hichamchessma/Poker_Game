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
  }[];

  @Column({ default: 2 })
  minPlayers: number;

  @Column({ default: 9 })
  maxPlayers: number;

  @Column({ default: 1000 })
  startingChips: number;

  @ManyToMany(() => Player)
  @JoinTable()
  players: Player[];

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;
}
