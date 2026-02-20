// Email Service for sending account notifications via Gmail SMTP
// Uses nodemailer with Gmail app password authentication

import nodemailer from 'nodemailer';
import SMTPTransport from 'nodemailer/lib/smtp-transport';
import { EMAIL_USER, EMAIL_APP_PASSWORD, EMAIL_FROM_NAME } from '../env';

export interface IEmailService {
  sendAccountInactivatedEmail(
    email: string,
    username: string
  ): Promise<boolean>;
  sendAccountReactivatedEmail(
    email: string,
    username: string
  ): Promise<boolean>;
}

/**
 * Email Service implementation using Gmail SMTP
 */
class EmailService implements IEmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    // Create reusable transporter using Gmail SMTP
    // Use explicit host/port with family:4 to force IPv4,
    // avoiding ENETUNREACH on hosts without IPv6 routing (e.g., Render)
    const options: SMTPTransport.Options = {
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: EMAIL_USER,
        pass: EMAIL_APP_PASSWORD
      },
      // Force IPv4 DNS resolution to avoid ENETUNREACH on hosts
      // without IPv6 routing (e.g., Render).
      // The 'family' option is passed through to net.connect() at runtime
      // but is missing from @types/nodemailer.
      ...({ family: 4 } as Record<string, unknown>)
    };
    this.transporter = nodemailer.createTransport(options);
  }

  /**
   * Check if email service is configured
   */
  private isConfigured(): boolean {
    return EMAIL_USER !== '' && EMAIL_APP_PASSWORD !== '';
  }

  /**
   * Send notification when account is inactivated
   * @param email - User's email address
   * @param username - User's username
   * @returns Promise<boolean> - true if email sent successfully
   */
  async sendAccountInactivatedEmail(
    email: string,
    username: string
  ): Promise<boolean> {
    if (!this.isConfigured()) {
      console.log(
        `[EmailService]: Email not configured. Skipping inactivation email for ${username}`
      );
      return false;
    }

    try {
      const mailOptions = {
        from: `"${EMAIL_FROM_NAME}" <${EMAIL_USER}>`,
        to: email,
        subject: `${EMAIL_FROM_NAME} - Your Account Has Been Deactivated`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #c41230;">Account Deactivated</h2>
            <p>Hello <strong>${username}</strong>,</p>
            <p>Your ${EMAIL_FROM_NAME} account has been deactivated by an administrator.</p>
            <p>If you believe this is an error or would like to request reactivation, 
               please contact your administrator.</p>
            <hr style="border: 1px solid #eee; margin: 20px 0;">
            <p style="color: #666; font-size: 12px;">
              This is an automated message from ${EMAIL_FROM_NAME}. Please do not reply to this email.
            </p>
          </div>
        `
      };

      await this.transporter.sendMail(mailOptions);
      console.log(
        `[EmailService]: Account inactivation email sent to ${email} for user ${username}`
      );
      return true;
    } catch (error) {
      console.error(
        `[EmailService]: Failed to send inactivation email:`,
        error
      );
      return false;
    }
  }

  /**
   * Send notification when account is reactivated
   * @param email - User's email address
   * @param username - User's username
   * @returns Promise<boolean> - true if email sent successfully
   */
  async sendAccountReactivatedEmail(
    email: string,
    username: string
  ): Promise<boolean> {
    if (!this.isConfigured()) {
      console.log(
        `[EmailService]: Email not configured. Skipping reactivation email for ${username}`
      );
      return false;
    }

    try {
      const mailOptions = {
        from: `"${EMAIL_FROM_NAME}" <${EMAIL_USER}>`,
        to: email,
        subject: `${EMAIL_FROM_NAME} - Your Account Has Been Reactivated`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2e7d32;">Account Reactivated</h2>
            <p>Hello <strong>${username}</strong>,</p>
            <p>Great news! Your ${EMAIL_FROM_NAME} account has been reactivated.</p>
            <p>You can now log in and access all your account features.</p>
            <hr style="border: 1px solid #eee; margin: 20px 0;">
            <p style="color: #666; font-size: 12px;">
              This is an automated message from ${EMAIL_FROM_NAME}. Please do not reply to this email.
            </p>
          </div>
        `
      };

      await this.transporter.sendMail(mailOptions);
      console.log(
        `[EmailService]: Account reactivation email sent to ${email} for user ${username}`
      );
      return true;
    } catch (error) {
      console.error(
        `[EmailService]: Failed to send reactivation email:`,
        error
      );
      return false;
    }
  }
}

// Export singleton instance
export default new EmailService();
