import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get birthday analytics for today
   */
  async getBirthdayAnalytics() {
    const today = new Date();
    const todayMonth = today.getMonth() + 1;
    const todayDay = today.getDate();

    // Find all users with birthdays today
    const users = await this.prisma.user.findMany({
      where: {
        details: {
          dob: {
            not: null,
          },
        },
      },
      include: {
        details: true,
      },
    });

    const birthdayUsers = users.filter((user) => {
      if (!user.details?.dob) return false;
      const dob = new Date(user.details.dob);
      return dob.getMonth() + 1 === todayMonth && dob.getDate() === todayDay;
    });

    // Get email logs for today's birthday emails
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    const emailLogs = await this.prisma.emailLog.findMany({
      where: {
        emailType: 'birthday',
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });

    const sentEmails = emailLogs.filter((log) => log.status === 'sent').length;
    const failedEmails = emailLogs.filter((log) => log.status === 'failed').length;

    return {
      date: today.toISOString().split('T')[0],
      totalBirthdays: birthdayUsers.length,
      emailsSent: sentEmails,
      emailsFailed: failedEmails,
      users: birthdayUsers.map((user) => ({
        id: user.id,
        email: user.email,
        name: `${user.details?.name || ''} ${user.details?.lastName || ''}`.trim() || 'Unknown',
        dob: user.details?.dob,
        hasEmailSent: emailLogs.some((log) => log.userId === user.id && log.status === 'sent'),
      })),
    };
  }

  /**
   * Get birthday analytics for a specific date
   */
  async getBirthdayAnalyticsForDate(date: Date) {
    const targetMonth = date.getMonth() + 1;
    const targetDay = date.getDate();

    const users = await this.prisma.user.findMany({
      where: {
        details: {
          dob: {
            not: null,
          },
        },
      },
      include: {
        details: true,
      },
    });

    const birthdayUsers = users.filter((user) => {
      if (!user.details?.dob) return false;
      const dob = new Date(user.details.dob);
      return dob.getMonth() + 1 === targetMonth && dob.getDate() === targetDay;
    });

    return {
      date: date.toISOString().split('T')[0],
      totalBirthdays: birthdayUsers.length,
      users: birthdayUsers.map((user) => ({
        id: user.id,
        email: user.email,
        name: `${user.details?.name || ''} ${user.details?.lastName || ''}`.trim() || 'Unknown',
        dob: user.details?.dob,
      })),
    };
  }
}

