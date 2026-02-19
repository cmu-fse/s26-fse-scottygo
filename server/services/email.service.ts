// Email Service for sending account notifications
// This service handles email notifications for account status changes

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
 * Email Service implementation
 * Note: This is a stub implementation. In production, integrate with
 * an actual email provider (e.g., SendGrid, AWS SES, Nodemailer)
 */
class EmailService implements IEmailService {
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
    // In production, implement actual email sending logic
    // For now, log the action and return success
    console.log(
      `[EmailService]: Account inactivation email sent to ${email} for user ${username}`
    );
    console.log(
      `[EmailService]: Message: Your account has been deactivated by an administrator. ` +
        `Please contact support if you believe this is an error.`
    );
    return true;
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
    // In production, implement actual email sending logic
    console.log(
      `[EmailService]: Account reactivation email sent to ${email} for user ${username}`
    );
    console.log(
      `[EmailService]: Message: Your account has been reactivated. You can now log in.`
    );
    return true;
  }
}

// Export singleton instance
export default new EmailService();
