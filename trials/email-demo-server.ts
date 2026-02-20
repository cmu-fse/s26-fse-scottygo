/**
 * Email Service Demo Server
 *
 * A simple Express server to test the EmailService component.
 *
 * Usage:
 *   npx ts-node trials/email-demo-server.ts
 *
 * Then open: http://localhost:3030
 */

import express, { Request, Response } from 'express';
import path from 'path';

// Import the email service (default export is a singleton instance)
import emailService from '../server/services/email.service';
import { EMAIL_USER, EMAIL_APP_PASSWORD } from '../server/env';

const app = express();
const PORT = 3030;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Serve the demo HTML page
app.get('/', (_req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, 'email-demo.html'));
});

// API endpoint to send email
app.post('/api/send-email', async (req: Request, res: Response) => {
  const { email, emailType, username } = req.body;

  // Validate input
  if (!email || !emailType) {
    res.status(400).json({
      success: false,
      message: 'Email and emailType are required'
    });
    return;
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    res.status(400).json({
      success: false,
      message: 'Invalid email format'
    });
    return;
  }

  try {
    let success = false;
    const displayUsername = username || 'TestUser';

    if (emailType === 'inactivated') {
      success = await emailService.sendAccountInactivatedEmail(
        email,
        displayUsername
      );
    } else if (emailType === 'reactivated') {
      success = await emailService.sendAccountReactivatedEmail(
        email,
        displayUsername
      );
    } else {
      res.status(400).json({
        success: false,
        message: 'Invalid email type. Use "inactivated" or "reactivated"'
      });
      return;
    }

    if (success) {
      res.json({
        success: true,
        message: `${emailType} email sent to ${email}`
      });
    } else {
      res.status(500).json({
        success: false,
        message:
          'Failed to send email. Check server logs and email configuration.'
      });
    }
  } catch (error) {
    console.error('Email send error:', error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

// Start server
app.listen(PORT, () => {
  const isConfigured = EMAIL_USER !== '' && EMAIL_APP_PASSWORD !== '';
  console.log(`\n📧 Email Demo Server running at http://localhost:${PORT}\n`);
  console.log('Email configuration status:');
  console.log(`  - Configured: ${isConfigured ? '✅ Yes' : '❌ No'}`);
  if (!isConfigured) {
    console.log('\n⚠️  Email is not configured. Check your .env file for:');
    console.log('   EMAIL_USER, EMAIL_APP_PASSWORD, EMAIL_FROM_NAME\n');
  }
});
