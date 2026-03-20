import {
  Body,
  Controller,
  Post,
  Get,
  Req,
  Put,
  Param,
  Patch,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { HospitalsService } from './hospitals.service';
import { CreateHospitalDto } from './dto/create-hospital.dto';
import { UpdateHospitalAdminDto } from './dto/update-hospital-admin.dto';
import { UpdateReceptionistDto } from './dto/update-receptionist.dto';
import { Roles } from '../auth/roles.decorator';

@Controller('hospitals')
@Roles('Super Admin', 'Group Admin', 'Hospital Admin')
export class HospitalsController {
  constructor(private readonly hospitalsService: HospitalsService) {}

  @Post()
  @Roles('Super Admin', 'Group Admin')
  create(@Body() createDto: CreateHospitalDto, @Req() req: any) {
    const userId = req.user.userId;
    if (!userId) {
      throw new Error('User ID not found in token.');
    }
    return this.hospitalsService.create(createDto, Number(userId));
  }

  @Put(':id')
  @Roles('Super Admin', 'Group Admin')
  update(
    @Param('id') id: string,
    @Body() updateDto: CreateHospitalDto,
    @Req() req: any,
  ) {
    const userId = req.user.userId;
    return this.hospitalsService.update(Number(id), updateDto, Number(userId));
  }

  @Get()
  findAll() {
    return this.hospitalsService.findAll();
  }

  @Get('admins')
  findAllAdmins() {
    return this.hospitalsService.findAllAdmins();
  }

  @Put('admin/:id')
  updateAdmin(
    @Param('id') id: string,
    @Body() updateDto: UpdateHospitalAdminDto,
  ) {
    return this.hospitalsService.updateAdmin(Number(id), updateDto);
  }

  @Patch('admin/:id/status')
  toggleAdminStatus(@Param('id') id: string) {
    return this.hospitalsService.toggleAdminStatus(Number(id));
  }

  @Get('receptionists')
  findAllReceptionists() {
    return this.hospitalsService.findAllReceptionists();
  }

  @Put('receptionist/:id')
  @UseInterceptors(FileInterceptor('file'))
  updateReceptionist(
    @Param('id') id: string,
    @Body() updateDto: UpdateReceptionistDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.hospitalsService.updateReceptionist(
      Number(id),
      updateDto,
      file,
    );
  }

  @Patch('receptionist/:id/status')
  toggleReceptionistStatus(@Param('id') id: string) {
    return this.hospitalsService.toggleReceptionistStatus(Number(id));
  }
}
