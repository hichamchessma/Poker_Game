import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Game } from './game.entity';
import { GamesService } from './games.service';
import { GamesController } from './games.controller';
import { Player } from '../players/player.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Game, Player])],
  providers: [GamesService],
  controllers: [GamesController],
  exports: [GamesService],
})
export class GamesModule {}
