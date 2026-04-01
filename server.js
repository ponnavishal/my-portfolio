require('dotenv').config();
const express = require('express');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Allow CORS for local development with Live Server
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, x-admin-key');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

app.use(express.static(__dirname));



const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const smtpReady =
  !!process.env.SMTP_HOST &&
  !!process.env.SMTP_PORT &&
  !!process.env.SMTP_USER &&
  !!process.env.SMTP_PASS &&
  !!process.env.TO_EMAIL;

const transporter = smtpReady
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT),
      secure: Number(process.env.SMTP_PORT) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })
  : null;

async function forwardToInbox(payload) {
  if (!transporter) {
    return false;
  }

  const html = `
    <h2>New Portfolio Contact Message</h2>
    <p><strong>Name:</strong> ${payload.name}</p>
    <p><strong>Email:</strong> ${payload.email}</p>
    <p><strong>Subject:</strong> ${payload.subject}</p>
    <p><strong>Time:</strong> ${payload.createdAt}</p>
    <hr>
    <p><strong>Message:</strong></p>
    <p>${payload.message.replace(/\n/g, '<br>')}</p>
  `;

  await transporter.sendMail({
    from: process.env.FROM_EMAIL || process.env.SMTP_USER,
    to: process.env.TO_EMAIL,
    replyTo: payload.email,
    subject: `Portfolio Contact: ${payload.subject}`,
    text: `New contact message\n\nName: ${payload.name}\nEmail: ${payload.email}\nSubject: ${payload.subject}\nTime: ${payload.createdAt}\n\nMessage:\n${payload.message}`,
    html,
  });

  return true;
}

app.post(['/api/contact', '/contact', '/server.js'], async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim();
    const subject = String(req.body.subject || '').trim();
    const message = String(req.body.message || '').trim();

    if (!name || !email || !subject || message.length < 20) {
      return res.status(400).json({ error: 'Please fill all fields correctly.' });
    }

    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const payload = {
      name,
      email,
      subject,
      message,
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || '',
      createdAt: new Date().toISOString(),
    };

    let emailSent = false;
    try {
      emailSent = await forwardToInbox(payload);
    } catch (emailErr) {
      console.error('Email forward failed:', emailErr.message);
      return res.status(500).json({ error: 'Failed to send message via email.' });
    }

    if (emailSent) {
      return res.status(200).json({
        ok: true,
        message: 'Message sent successfully.'
      });
    } else {
      return res.status(500).json({ error: 'Email configuration is missing or incorrect on the server.' });
    }
  } catch (err) {
    console.error('Contact form error:', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Portfolio server running at http://localhost:${PORT}`);
    if (!smtpReady) {
      console.log('WARNING: SMTP is not configured. Contact messages will fail to send.');
    }
  });
}

module.exports = app;
