const nodemailer = require('nodemailer');

let _transporter = null;

function getTransporter() {
    if (!_transporter) {
        _transporter = nodemailer.createTransport({
            host:   process.env.SMTP_HOST,
            port:   parseInt(process.env.SMTP_PORT || '587'),
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });
    }
    return _transporter;
}

async function sendOtpEmail(email, otp) {
    await getTransporter().sendMail({
        from:    process.env.SMTP_FROM || 'Dark Ages <noreply@example.com>',
        to:      email,
        subject: `${otp} – Dein Dark Ages Login-Code`,
        text:    `Dein Login-Code: ${otp}\n\nDer Code ist 10 Minuten gültig. Falls du dich nicht einloggen wolltest, ignoriere diese Mail.`,
        html:    `<div style="font-family:sans-serif;max-width:400px;">
                    <h2 style="color:#e8b84a;">Dark Ages</h2>
                    <p>Dein Login-Code:</p>
                    <h1 style="letter-spacing:8px;color:#333;">${otp}</h1>
                    <p style="color:#888;font-size:0.9rem;">Der Code ist 10 Minuten gültig.</p>
                  </div>`,
    });
}

module.exports = { sendOtpEmail };
