import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { MessageResponseDto } from '../common/dto/message-response.dto';
import type { PaginatedResult } from '../common/helpers/pagination.helper';
import { AdminUsersQueryDto } from './dto/admin-users-query.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UserRole } from './entities/user.entity';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMe(@CurrentUser() user: AuthUser): Promise<UserResponseDto> {
    return this.usersService.getMe(user.id);
  }

  @Patch('me')
  updateMe(@CurrentUser() user: AuthUser, @Body() dto: UpdateUserDto): Promise<UserResponseDto> {
    return this.usersService.updateMe(user.id, dto);
  }

  @Patch('me/password')
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<MessageResponseDto> {
    await this.usersService.changePassword(user.id, dto.currentPassword, dto.newPassword);
    return new MessageResponseDto('Password changed successfully');
  }

  @Get()
  @Roles(UserRole.ADMIN)
  list(@Query() query: AdminUsersQueryDto): Promise<PaginatedResult<UserResponseDto>> {
    return this.usersService.list(query);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<UserResponseDto> {
    return this.usersService.getById(id);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() admin: AuthUser,
  ): Promise<UserResponseDto> {
    return this.usersService.deactivate(id, admin.id);
  }
}
