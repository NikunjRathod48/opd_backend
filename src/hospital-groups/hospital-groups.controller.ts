import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Param,
  Req,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { HospitalGroupsService } from './hospital-groups.service';
import { CreateHospitalGroupDto } from './dto/create-hospital-group.dto';
import { UpdateHospitalGroupDto } from './dto/update-hospital-group.dto';
import { UpdateGroupAdminDto } from './dto/update-group-admin.dto';
import { Roles } from '../auth/roles.decorator';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('hospital-groups')
@Roles('Super Admin')
export class HospitalGroupsController {
  constructor(private readonly hospitalGroupsService: HospitalGroupsService) {}

  @Post()
  create(@Body() createDto: CreateHospitalGroupDto, @Req() req: any) {
    const userId = req.user.userId;
    if (!userId) {
      throw new Error('User ID not found in token.');
    }
    return this.hospitalGroupsService.create(createDto, Number(userId));
  }

  @Get()
  @Roles('Super Admin', 'Group Admin')
  findAll() {
    return this.hospitalGroupsService.findAll();
  }

  @Get('admins')
  findAllGroupAdmins() {
    return this.hospitalGroupsService.findAllGroupAdmins();
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() updateDto: UpdateHospitalGroupDto,
    @Req() req: any,
  ) {
    const userId = req.user.userId;
    if (!userId) {
      throw new Error('User ID not found in token.');
    }
    return this.hospitalGroupsService.update(
      Number(id),
      updateDto,
      Number(userId),
    );
  }

  @Put('admin/:id')
  @UseInterceptors(FileInterceptor('file'))
  updateAdmin(
    @Param('id') id: string,
    @Body() updateDto: UpdateGroupAdminDto,
    @Req() req: any,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const userId = req.user.userId;
    return this.hospitalGroupsService.updateGroupAdmin(
      Number(id),
      updateDto,
      Number(userId),
      file,
    );
  }

  @Put('admin/:id/status')
  async toggleStatus(
    @Param('id') id: string,
    @Body('is_active') isActive: boolean,
    @Req() req: any,
  ) {
    const userId = req.user.userId;
    return this.hospitalGroupsService.toggleAdminStatus(
      Number(id),
      isActive,
      Number(userId),
    );
  }
}
