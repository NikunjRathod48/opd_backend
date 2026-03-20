import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
    constructor(private prisma: PrismaService) { }

    async getDashboardAnalytics(hospitalId?: number, hospitalGroupId?: number) {
        // Build base condition filtering
        const hospitalCondition = hospitalId ? { hospital_id: hospitalId } : {};
        const groupCondition = hospitalGroupId
            ? { hospital_group_id: hospitalGroupId }
            : {};

        // 1. Total Appointments
        const totalAppointments = await this.prisma.appointments.count({
            where: {
                ...hospitalCondition,
            },
        });

        // 2. Active Patients
        // A proxy for active patients: number of patients associated with the scope
        // Note: Patients belong to the global or Group level, or we filter by their visits.
        const activePatients = await this.prisma.patients.count({
            where: {
                ...groupCondition,
                ...(hospitalId ? {
                    opd_visits: {
                        some: { hospital_id: hospitalId }
                    }
                } : {})
            }
        });

        // 3. Billing (Revenue) Data Gathering
        const billingRecords = await this.prisma.billing.findMany({
            where: {
                ...hospitalCondition,
            },
            include: {
                hospitals: true,
            },
        });

        const totalRevenue = billingRecords.reduce(
            (sum, r) => sum + Number(r.total_amount || 0),
            0,
        );

        // 4. Revenue Trend (Last 6 Months Mocking Real Data Using Existing Timestamps)
        const months = [
            'Jan',
            'Feb',
            'Mar',
            'Apr',
            'May',
            'Jun',
            'Jul',
            'Aug',
            'Sep',
            'Oct',
            'Nov',
            'Dec',
        ];
        const currentMonthIndex = new Date().getMonth();

        // Setup empty 6 months skeleton
        const revenueTrendData: {
            name: string;
            monthIndex: number;
            revenue: number;
            expenses: number;
        }[] = [];
        for (let i = 5; i >= 0; i--) {
            let mIndex = currentMonthIndex - i;
            if (mIndex < 0) mIndex += 12; // wrap around year
            revenueTrendData.push({
                name: months[mIndex],
                monthIndex: mIndex,
                revenue: 0,
                expenses: 0, // Exposes for future use, default 0 for now as we don't track expenses yet
            });
        }

        // Populate trend data
        billingRecords.forEach((record) => {
            const rMonth = new Date(record.created_at).getMonth();
            const existingPoint = revenueTrendData.find(
                (m) => m.monthIndex === rMonth,
            );
            if (existingPoint) {
                existingPoint.revenue += Number(record.total_amount || 0);
            }
        });

        // Clean up internal sort param before returning
        const cleanedRevenueTrendData = revenueTrendData.map((data) => ({
            name: data.name,
            revenue: data.revenue,
            expenses: data.expenses,
        }));

        // 5. App Status
        const appStatusGroups = await this.prisma.appointments.groupBy({
            by: ['appointment_status'],
            where: {
                ...hospitalCondition,
            },
            _count: {
                appointment_status: true,
            },
        });

        const appStatusData = appStatusGroups.map((group) => ({
            name: group.appointment_status,
            value: group._count.appointment_status,
        }));

        // Ensure there is some data if empty
        if (appStatusData.length === 0) {
            appStatusData.push({ name: 'No Appointments', value: 1 });
        }

        // 6. Revenue By Hospital
        const hospitalRevenueMap = {};
        billingRecords.forEach((b) => {
            const hName = b.hospitals?.hospital_name || 'Unknown';
            if (!hospitalRevenueMap[hName]) {
                hospitalRevenueMap[hName] = {
                    name: hName,
                    revenue: 0,
                    visits: 0,
                };
            }
            hospitalRevenueMap[hName].revenue += Number(b.total_amount || 0);
            hospitalRevenueMap[hName].visits += 1; // Assuming 1 bill = roughly 1 visit proxy
        });

        // Sort by top revenue
        const revenueByHospitalData = Object.values(hospitalRevenueMap)
            .sort((a: any, b: any) => b.revenue - a.revenue)
            .slice(0, 5);

        return {
            totalRevenue,
            totalAppointments,
            activePatients,
            treatmentSuccessRate: 98.2, // Still mock until structured treatment outcome tracking exists
            revenueTrendData: cleanedRevenueTrendData,
            appStatusData,
            revenueByHospitalData,
        };
    }
}
