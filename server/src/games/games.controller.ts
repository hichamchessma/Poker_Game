import { Controller, Post, Param, Body, Delete, Put, Get, ParseIntPipe, HttpStatus, HttpCode } from '@nestjs/common';
import { GamesService } from './games.service';
import { Game } from './game.entity';
import { PlayerAction } from './game.entity';

// DTOs
class CreateGameDto {
  smallBlind: number;
  bigBlind: number;
}

class PlayerActionDto {
  action: PlayerAction;
  amount?: number;
}

@Controller('games')
export class GamesController {
  constructor(private readonly gamesService: GamesService) {}

  @Post()
  async createGame(@Body() createGameDto: CreateGameDto): Promise<Game> {
    return this.gamesService.createGame(createGameDto.smallBlind, createGameDto.bigBlind);
  }

  @Post(':gameId/join/:playerId')
  async joinGame(
    @Param('gameId', ParseIntPipe) gameId: number,
    @Param('playerId', ParseIntPipe) playerId: number,
  ): Promise<Game> {
    return this.gamesService.joinGame(gameId, playerId);
  }

  @Post(':gameId/start')
  @HttpCode(HttpStatus.OK)
  async startRound(@Param('gameId', ParseIntPipe) gameId: number): Promise<Game> {
    return this.gamesService.startRound(gameId);
  }

  @Post(':gameId/player/:playerId/action')
  async playerAction(
    @Param('gameId', ParseIntPipe) gameId: number,
    @Param('playerId', ParseIntPipe) playerId: number,
    @Body() actionDto: PlayerActionDto,
  ): Promise<Game> {
    return this.gamesService.handlePlayerAction(gameId, playerId, actionDto.action, actionDto.amount);
  }

  @Post(':gameId/next-round')
  async moveToNextRound(@Param('gameId', ParseIntPipe) gameId: number): Promise<Game> {
    return this.gamesService.progressToNextRound(gameId);
  }

  @Delete(':gameId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async endGame(@Param('gameId', ParseIntPipe) gameId: number): Promise<void> {
    return this.gamesService.endGame(gameId);
  }
}
