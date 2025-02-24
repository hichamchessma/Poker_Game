import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Player } from './player.entity';

@Injectable()
export class PlayersService {
 constructor(
 @InjectRepository(Player)
 private playersRepository: Repository<Player>,
 ) {}

 async findAll(): Promise<Player[]> {
 return this.playersRepository.find();
 }

 async findOne(id: number): Promise<Player> {
 const player = await this.playersRepository.findOne({ where: { id } });
 if (!player) {
 throw new Error(`Player with ID ${id} not found`);
 }
 return player;
 }

 async create(player: Player): Promise<Player> {
 return this.playersRepository.save(player);
 }

 async update(id: number, player: Player): Promise<Player> {
 try {
 await this.playersRepository.update(id, player);
 const updatedPlayer = await this.playersRepository.findOne({ where: { id } });
 if (!updatedPlayer) {
 throw new Error(`Player with ID ${id} not found after update`);
 }
 return updatedPlayer;
 } catch (error) {
 throw new Error(`Failed to update player: ${error.message}`);
 }
 }

 async remove(id: number): Promise<void> {
 try {
 await this.playersRepository.delete(id);
 } catch (error) {
 throw new Error(`Failed to delete player: ${error.message}`);
 }
 }
}
