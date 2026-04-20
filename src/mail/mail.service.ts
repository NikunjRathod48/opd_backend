import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface AppointmentEmailData {
  patientName: string;
  patientEmail: string;
  doctorName: string;
  hospitalName: string;
  appointmentDate: string; // formatted string e.g. "Monday, 21 April 2026"
  appointmentTime: string; // formatted string e.g. "10:30 AM"
  appointmentNo: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private configService: ConfigService) {}

  private createTransporter() {
    const smtpEmail = this.configService.get<string>('SMTP_EMAIL');
    const smtpPassword = this.configService.get<string>('SMTP_PASSWORD');

    if (!smtpEmail || !smtpPassword) {
      throw new Error('SMTP_EMAIL and SMTP_PASSWORD environment variables are required.');
    }

    return {
      transporter: nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
          user: smtpEmail,
          pass: smtpPassword,
        },
      }),
      smtpEmail,
    };
  }

  async sendAppointmentConfirmation(data: AppointmentEmailData): Promise<void> {
    try {
      const { transporter, smtpEmail } = this.createTransporter();

      const mailOptions = {
        from: `"MedCore" <${smtpEmail}>`,
        to: data.patientEmail,
        subject: `Appointment Confirmed - ${data.appointmentNo} | MedCore`,
        html: this.buildAppointmentEmailHtml(data),
      };

      await transporter.sendMail(mailOptions);
      this.logger.log(`Appointment confirmation email sent to ${data.patientEmail}`);
    } catch (error) {
      // Log but don't throw — email failure shouldn't block booking
      this.logger.error(`Failed to send appointment email to ${data.patientEmail}`, error?.stack || error);
    }
  }

  private buildAppointmentEmailHtml(data: AppointmentEmailData): string {
    return `
    <div style="font-family: 'Inter', 'Segoe UI', Arial, sans-serif; background-color: #f3f4f6; padding: 40px 0; min-height: 100vh;">
      <div style="max-width: 540px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); padding: 32px 24px; text-align: center;">
          <div style="display: inline-block; background-color: rgba(255, 255, 255, 0.15); backdrop-filter: blur(8px); padding: 12px; border-radius: 16px; margin-bottom: 16px; border: 1px solid rgba(255, 255, 255, 0.3);">
            <div style="background-color: #ffffff; color: #1e3a8a; width: 40px; height: 40px; border-radius: 10px; display: block; text-align: center; font-size: 24px; font-weight: 900; margin: 0 auto; line-height: 40px;">M</div>
          </div>
          <h1 style="color: #ffffff; font-size: 24px; font-weight: 700; margin: 0; letter-spacing: -0.5px;">Appointment Confirmed</h1>
          <p style="color: rgba(255,255,255,0.8); font-size: 14px; margin: 8px 0 0;">Your appointment has been successfully booked</p>
        </div>
        
        <!-- Body -->
        <div style="padding: 32px 24px;">
          <p style="color: #4b5563; font-size: 16px; line-height: 24px; margin-top: 0; margin-bottom: 24px;">
            Hello <strong>${data.patientName}</strong>,
          </p>
          <p style="color: #4b5563; font-size: 16px; line-height: 24px; margin-top: 0; margin-bottom: 24px;">
            Your appointment has been confirmed. Here are the details:
          </p>
          
          <!-- Appointment Details Card -->
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 0; margin-bottom: 24px; overflow: hidden;">
            
            <!-- Appointment Number Banner -->
            <div style="background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%); padding: 14px 20px; text-align: center;">
              <span style="color: rgba(255,255,255,0.7); font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Appointment No.</span>
              <div style="color: #ffffff; font-size: 20px; font-weight: 700; margin-top: 2px; letter-spacing: 1px;">${data.appointmentNo}</div>
            </div>

            <!-- Details Grid (table-based for email client compatibility) -->
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="padding: 20px;">
              <!-- Doctor -->
              <tr>
                <td width="50" style="padding-bottom: 16px; border-bottom: 1px solid #e2e8f0; vertical-align: top;">
                  <div style="width: 36px; height: 36px; background-color: #dbeafe; border-radius: 10px; text-align: center; line-height: 36px; font-size: 18px;">&#x1FA7A;</div>
                </td>
                <td style="padding-bottom: 16px; border-bottom: 1px solid #e2e8f0; vertical-align: top;">
                  <div style="color: #9ca3af; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">Doctor</div>
                  <div style="color: #1e293b; font-size: 15px; font-weight: 600;">${data.doctorName}</div>
                </td>
              </tr>
              <!-- Spacer -->
              <tr><td colspan="2" style="height: 16px;"></td></tr>
              <!-- Date -->
              <tr>
                <td width="50" style="padding-bottom: 16px; border-bottom: 1px solid #e2e8f0; vertical-align: top;">
                  <div style="width: 36px; height: 36px; background-color: #dcfce7; border-radius: 10px; text-align: center; line-height: 36px; font-size: 18px;">&#x1F4C5;</div>
                </td>
                <td style="padding-bottom: 16px; border-bottom: 1px solid #e2e8f0; vertical-align: top;">
                  <div style="color: #9ca3af; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">Date</div>
                  <div style="color: #1e293b; font-size: 15px; font-weight: 600;">${data.appointmentDate}</div>
                </td>
              </tr>
              <!-- Spacer -->
              <tr><td colspan="2" style="height: 16px;"></td></tr>
              <!-- Time -->
              <tr>
                <td width="50" style="padding-bottom: 16px; border-bottom: 1px solid #e2e8f0; vertical-align: top;">
                  <div style="width: 36px; height: 36px; background-color: #fef3c7; border-radius: 10px; text-align: center; line-height: 36px; font-size: 18px;">&#x1F550;</div>
                </td>
                <td style="padding-bottom: 16px; border-bottom: 1px solid #e2e8f0; vertical-align: top;">
                  <div style="color: #9ca3af; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">Time</div>
                  <div style="color: #1e293b; font-size: 15px; font-weight: 600;">${data.appointmentTime}</div>
                </td>
              </tr>
              <!-- Spacer -->
              <tr><td colspan="2" style="height: 16px;"></td></tr>
              <!-- Hospital -->
              <tr>
                <td width="50" style="vertical-align: top;">
                  <div style="width: 36px; height: 36px; background-color: #fce7f3; border-radius: 10px; text-align: center; line-height: 36px; font-size: 18px;">&#x1F3E5;</div>
                </td>
                <td style="vertical-align: top;">
                  <div style="color: #9ca3af; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">Hospital</div>
                  <div style="color: #1e293b; font-size: 15px; font-weight: 600;">${data.hospitalName}</div>
                </td>
              </tr>
            </table>
          </div>
          
          <!-- Reminder -->
          <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; border-radius: 0 8px 8px 0; margin-bottom: 24px;">
            <p style="color: #1e40af; font-size: 14px; margin: 0; font-weight: 500;">
              Please arrive 15 minutes before your scheduled time for check-in.
            </p>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; line-height: 20px; border-top: 1px solid #e5e7eb; padding-top: 24px; margin-top: 0; margin-bottom: 0;">
            If you need to cancel or reschedule, please contact the hospital reception. Thank you for choosing MedCore.
          </p>
        </div>
        
        <!-- Footer -->
        <div style="background-color: #f9fafb; border-top: 1px solid #e5e7eb; padding: 24px; text-align: center;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0 0 8px;">
            MedCore Hospital Management System
          </p>
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">
            &copy; ${new Date().getFullYear()} MedCore. All rights reserved.
          </p>
        </div>
        
      </div>
    </div>
    `;
  }

  // ─── Reschedule Email ────────────────────────────────────────────

  async sendAppointmentRescheduled(data: AppointmentEmailData & {
    oldDate: string;
    oldTime: string;
  }): Promise<void> {
    try {
      const { transporter, smtpEmail } = this.createTransporter();

      const mailOptions = {
        from: `"MedCore" <${smtpEmail}>`,
        to: data.patientEmail,
        subject: `Appointment Rescheduled - ${data.appointmentNo} | MedCore`,
        html: this.buildRescheduleEmailHtml(data),
      };

      await transporter.sendMail(mailOptions);
      this.logger.log(`Reschedule email sent to ${data.patientEmail}`);
    } catch (error) {
      this.logger.error(`Failed to send reschedule email to ${data.patientEmail}`, error?.stack || error);
    }
  }

  private buildRescheduleEmailHtml(data: AppointmentEmailData & { oldDate: string; oldTime: string }): string {
    return `
    <div style="font-family: 'Inter', 'Segoe UI', Arial, sans-serif; background-color: #f3f4f6; padding: 40px 0; min-height: 100vh;">
      <div style="max-width: 540px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #92400e 0%, #f59e0b 100%); padding: 32px 24px; text-align: center;">
          <div style="display: inline-block; background-color: rgba(255, 255, 255, 0.15); padding: 12px; border-radius: 16px; margin-bottom: 16px; border: 1px solid rgba(255, 255, 255, 0.3);">
            <div style="background-color: #ffffff; color: #92400e; width: 40px; height: 40px; border-radius: 10px; display: block; text-align: center; font-size: 24px; font-weight: 900; margin: 0 auto; line-height: 40px;">M</div>
          </div>
          <h1 style="color: #ffffff; font-size: 24px; font-weight: 700; margin: 0; letter-spacing: -0.5px;">Appointment Rescheduled</h1>
          <p style="color: rgba(255,255,255,0.8); font-size: 14px; margin: 8px 0 0;">Your appointment has been moved to a new date/time</p>
        </div>
        
        <!-- Body -->
        <div style="padding: 32px 24px;">
          <p style="color: #4b5563; font-size: 16px; line-height: 24px; margin-top: 0; margin-bottom: 24px;">
            Hello <strong>${data.patientName}</strong>,
          </p>
          <p style="color: #4b5563; font-size: 16px; line-height: 24px; margin-top: 0; margin-bottom: 24px;">
            Your appointment <strong>${data.appointmentNo}</strong> has been rescheduled. Please see the updated details below:
          </p>

          <!-- Old vs New Comparison -->
          <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-bottom: 24px;">
            <tr>
              <!-- Old Schedule -->
              <td width="48%" style="vertical-align: top;">
                <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 16px; text-align: center;">
                  <div style="color: #991b1b; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; margin-bottom: 8px;">Previous</div>
                  <div style="color: #dc2626; font-size: 14px; font-weight: 600; text-decoration: line-through; margin-bottom: 4px;">${data.oldDate}</div>
                  <div style="color: #dc2626; font-size: 14px; font-weight: 600; text-decoration: line-through;">${data.oldTime}</div>
                </div>
              </td>
              <!-- Arrow -->
              <td width="4%" style="text-align: center; vertical-align: middle; font-size: 20px;">&#x27A1;</td>
              <!-- New Schedule -->
              <td width="48%" style="vertical-align: top;">
                <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 12px; padding: 16px; text-align: center;">
                  <div style="color: #065f46; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; margin-bottom: 8px;">Updated</div>
                  <div style="color: #059669; font-size: 14px; font-weight: 600; margin-bottom: 4px;">${data.appointmentDate}</div>
                  <div style="color: #059669; font-size: 14px; font-weight: 600;">${data.appointmentTime}</div>
                </div>
              </td>
            </tr>
          </table>

          <!-- Details -->
          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; margin-bottom: 24px;">
            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="padding: 20px;">
              <tr>
                <td width="50" style="padding-bottom: 12px; border-bottom: 1px solid #e2e8f0; vertical-align: top;">
                  <div style="width: 36px; height: 36px; background-color: #dbeafe; border-radius: 10px; text-align: center; line-height: 36px; font-size: 18px;">&#x1FA7A;</div>
                </td>
                <td style="padding-bottom: 12px; border-bottom: 1px solid #e2e8f0; vertical-align: top;">
                  <div style="color: #9ca3af; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">Doctor</div>
                  <div style="color: #1e293b; font-size: 15px; font-weight: 600;">${data.doctorName}</div>
                </td>
              </tr>
              <tr><td colspan="2" style="height: 12px;"></td></tr>
              <tr>
                <td width="50" style="vertical-align: top;">
                  <div style="width: 36px; height: 36px; background-color: #fce7f3; border-radius: 10px; text-align: center; line-height: 36px; font-size: 18px;">&#x1F3E5;</div>
                </td>
                <td style="vertical-align: top;">
                  <div style="color: #9ca3af; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">Hospital</div>
                  <div style="color: #1e293b; font-size: 15px; font-weight: 600;">${data.hospitalName}</div>
                </td>
              </tr>
            </table>
          </div>
          
          <div style="background-color: #fffbeb; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 0 8px 8px 0; margin-bottom: 24px;">
            <p style="color: #92400e; font-size: 14px; margin: 0; font-weight: 500;">
              Please arrive 15 minutes before your new scheduled time for check-in.
            </p>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; line-height: 20px; border-top: 1px solid #e5e7eb; padding-top: 24px; margin-top: 0; margin-bottom: 0;">
            If you have any concerns, please contact the hospital reception. Thank you for choosing MedCore.
          </p>
        </div>
        
        <!-- Footer -->
        <div style="background-color: #f9fafb; border-top: 1px solid #e5e7eb; padding: 24px; text-align: center;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0 0 8px;">MedCore Hospital Management System</p>
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">&copy; ${new Date().getFullYear()} MedCore. All rights reserved.</p>
        </div>
        
      </div>
    </div>
    `;
  }

  // ─── Cancellation Email ──────────────────────────────────────────

  async sendAppointmentCancelled(data: AppointmentEmailData): Promise<void> {
    try {
      const { transporter, smtpEmail } = this.createTransporter();

      const mailOptions = {
        from: `"MedCore" <${smtpEmail}>`,
        to: data.patientEmail,
        subject: `Appointment Cancelled - ${data.appointmentNo} | MedCore`,
        html: this.buildCancellationEmailHtml(data),
      };

      await transporter.sendMail(mailOptions);
      this.logger.log(`Cancellation email sent to ${data.patientEmail}`);
    } catch (error) {
      this.logger.error(`Failed to send cancellation email to ${data.patientEmail}`, error?.stack || error);
    }
  }

  private buildCancellationEmailHtml(data: AppointmentEmailData): string {
    return `
    <div style="font-family: 'Inter', 'Segoe UI', Arial, sans-serif; background-color: #f3f4f6; padding: 40px 0; min-height: 100vh;">
      <div style="max-width: 540px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #991b1b 0%, #ef4444 100%); padding: 32px 24px; text-align: center;">
          <div style="display: inline-block; background-color: rgba(255, 255, 255, 0.15); padding: 12px; border-radius: 16px; margin-bottom: 16px; border: 1px solid rgba(255, 255, 255, 0.3);">
            <div style="background-color: #ffffff; color: #991b1b; width: 40px; height: 40px; border-radius: 10px; display: block; text-align: center; font-size: 24px; font-weight: 900; margin: 0 auto; line-height: 40px;">M</div>
          </div>
          <h1 style="color: #ffffff; font-size: 24px; font-weight: 700; margin: 0; letter-spacing: -0.5px;">Appointment Cancelled</h1>
          <p style="color: rgba(255,255,255,0.8); font-size: 14px; margin: 8px 0 0;">Your appointment has been cancelled</p>
        </div>
        
        <!-- Body -->
        <div style="padding: 32px 24px;">
          <p style="color: #4b5563; font-size: 16px; line-height: 24px; margin-top: 0; margin-bottom: 24px;">
            Hello <strong>${data.patientName}</strong>,
          </p>
          <p style="color: #4b5563; font-size: 16px; line-height: 24px; margin-top: 0; margin-bottom: 24px;">
            We're writing to inform you that the following appointment has been cancelled:
          </p>

          <!-- Cancelled Appointment Details -->
          <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; overflow: hidden; margin-bottom: 24px;">
            <!-- Appointment Number Banner -->
            <div style="background: linear-gradient(135deg, #991b1b 0%, #dc2626 100%); padding: 14px 20px; text-align: center;">
              <span style="color: rgba(255,255,255,0.7); font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Cancelled Appointment</span>
              <div style="color: #ffffff; font-size: 20px; font-weight: 700; margin-top: 2px; letter-spacing: 1px; text-decoration: line-through;">${data.appointmentNo}</div>
            </div>

            <table cellpadding="0" cellspacing="0" border="0" width="100%" style="padding: 20px;">
              <tr>
                <td width="50" style="padding-bottom: 12px; border-bottom: 1px solid #fecaca; vertical-align: top;">
                  <div style="width: 36px; height: 36px; background-color: #fee2e2; border-radius: 10px; text-align: center; line-height: 36px; font-size: 18px;">&#x1FA7A;</div>
                </td>
                <td style="padding-bottom: 12px; border-bottom: 1px solid #fecaca; vertical-align: top;">
                  <div style="color: #9ca3af; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">Doctor</div>
                  <div style="color: #1e293b; font-size: 15px; font-weight: 600;">${data.doctorName}</div>
                </td>
              </tr>
              <tr><td colspan="2" style="height: 12px;"></td></tr>
              <tr>
                <td width="50" style="padding-bottom: 12px; border-bottom: 1px solid #fecaca; vertical-align: top;">
                  <div style="width: 36px; height: 36px; background-color: #fee2e2; border-radius: 10px; text-align: center; line-height: 36px; font-size: 18px;">&#x1F4C5;</div>
                </td>
                <td style="padding-bottom: 12px; border-bottom: 1px solid #fecaca; vertical-align: top;">
                  <div style="color: #9ca3af; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">Date</div>
                  <div style="color: #1e293b; font-size: 15px; font-weight: 600; text-decoration: line-through;">${data.appointmentDate}</div>
                </td>
              </tr>
              <tr><td colspan="2" style="height: 12px;"></td></tr>
              <tr>
                <td width="50" style="padding-bottom: 12px; border-bottom: 1px solid #fecaca; vertical-align: top;">
                  <div style="width: 36px; height: 36px; background-color: #fee2e2; border-radius: 10px; text-align: center; line-height: 36px; font-size: 18px;">&#x1F550;</div>
                </td>
                <td style="padding-bottom: 12px; border-bottom: 1px solid #fecaca; vertical-align: top;">
                  <div style="color: #9ca3af; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">Time</div>
                  <div style="color: #1e293b; font-size: 15px; font-weight: 600; text-decoration: line-through;">${data.appointmentTime}</div>
                </td>
              </tr>
              <tr><td colspan="2" style="height: 12px;"></td></tr>
              <tr>
                <td width="50" style="vertical-align: top;">
                  <div style="width: 36px; height: 36px; background-color: #fee2e2; border-radius: 10px; text-align: center; line-height: 36px; font-size: 18px;">&#x1F3E5;</div>
                </td>
                <td style="vertical-align: top;">
                  <div style="color: #9ca3af; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px;">Hospital</div>
                  <div style="color: #1e293b; font-size: 15px; font-weight: 600;">${data.hospitalName}</div>
                </td>
              </tr>
            </table>
          </div>
          
          <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; border-radius: 0 8px 8px 0; margin-bottom: 24px;">
            <p style="color: #1e40af; font-size: 14px; margin: 0; font-weight: 500;">
              If you'd like to book a new appointment, please visit MedCore or contact the hospital reception.
            </p>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; line-height: 20px; border-top: 1px solid #e5e7eb; padding-top: 24px; margin-top: 0; margin-bottom: 0;">
            If this cancellation was made in error, please contact the hospital immediately. Thank you for choosing MedCore.
          </p>
        </div>
        
        <!-- Footer -->
        <div style="background-color: #f9fafb; border-top: 1px solid #e5e7eb; padding: 24px; text-align: center;">
          <p style="color: #9ca3af; font-size: 12px; margin: 0 0 8px;">MedCore Hospital Management System</p>
          <p style="color: #9ca3af; font-size: 12px; margin: 0;">&copy; ${new Date().getFullYear()} MedCore. All rights reserved.</p>
        </div>
        
      </div>
    </div>
    `;
  }
}
