import { Controller, Get, Post, Body, Param, Put, Delete } from '@nestjs/common';
import { PlayersService } from './players.service';
import { Player } from './player.entity';

@Controller('players')
export class PlayersController {
 constructor(private readonly playersService: PlayersService) {}

 @Get()
 async findAll(): Promise<Player[]> {
 return this.playersService.findAll();
 }

 @Get(':id')
 async findOne(@Param('id') id: number): Promise<Player> {
 return this.playersService.findOne(id);
 }

 @Post()
 async create(@Body() player: Player): Promise<Player> {
 return this.playersService.create(player);
 }

 @Put(':id')
 async update(@Param('id') id: number, @Body() player: Player): Promise<Player> {
 return this.playersService.update(id, player);
 }

 @Delete(':id')
 async remove(@Param('id') id: number): Promise<void> {
 return this.playersService.remove(id);
 }
}
