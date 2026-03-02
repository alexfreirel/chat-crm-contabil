import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { SectorsService } from './sectors.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('sectors')
export class SectorsController {
  constructor(private svc: SectorsService) {}

  @Get()
  findAll() {
    return this.svc.findAll();
  }

  @Post()
  create(@Body('name') name: string) {
    return this.svc.create(name);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body('name') name: string) {
    return this.svc.update(id, name);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }

  @Post(':id/users')
  addUser(@Param('id') id: string, @Body('userId') userId: string) {
    return this.svc.addUser(id, userId);
  }

  @Delete(':id/users/:userId')
  removeUser(@Param('id') id: string, @Param('userId') uid: string) {
    return this.svc.removeUser(id, uid);
  }
}
