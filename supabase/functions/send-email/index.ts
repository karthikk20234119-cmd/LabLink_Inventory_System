import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { SmtpClient } from "https://deno.land/x/smtp@v0.7.0/mod.ts";

// Gmail SMTP Configuration
// Set these in Supabase Dashboard -> Project Settings -> Edge Functions -> Secrets
// GMAIL_USER = your-email@gmail.com
// GMAIL_APP_PASSWORD = your-16-char-app-password (from Google App Passwords)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface EmailRequest {
  type: "confirmation" | "welcome_student" | "welcome_staff" | "password_reset" | "activation" | "resend_confirmation" | "credentials";
  to: string;
  name: string;
  email?: string;
  password?: string;
  role?: string;
  confirmationLink?: string;
  loginUrl?: string;
}

// Beautiful HTML Email Templates
const getEmailTemplate = (type: string, data: EmailRequest): { subject: string; html: string } => {
  const styles = `
    <style>
      body { margin: 0; padding: 0; background: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
      .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
      .header { background: linear-gradient(135deg, #0891B2 0%, #1E3A8A 100%); padding: 40px 30px; text-align: center; }
      .header h1 { color: #ffffff; margin: 0; font-size: 28px; }
      .header p { color: rgba(255,255,255,0.9); margin: 10px 0 0; font-size: 14px; }
      .content { padding: 40px 30px; }
      .content h2 { color: #1e293b; margin: 0 0 15px; font-size: 24px; }
      .content p { color: #64748b; line-height: 1.7; font-size: 16px; margin: 0 0 15px; }
      .button { display: inline-block; background: linear-gradient(135deg, #0891B2 0%, #0E7490 100%); color: #ffffff !important; padding: 16px 40px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; margin: 20px 0; }
      .cred-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; margin: 20px 0; }
      .cred-item { padding: 12px 0; border-bottom: 1px solid #e2e8f0; }
      .cred-item:last-child { border-bottom: none; }
      .cred-label { color: #94a3b8; font-size: 12px; text-transform: uppercase; margin: 0 0 5px; font-weight: 600; }
      .cred-value { color: #1e293b; font-size: 18px; font-weight: 600; margin: 0; font-family: monospace; }
      .warning { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px 20px; border-radius: 0 8px 8px 0; margin: 20px 0; }
      .warning p { color: #92400e; margin: 0; font-size: 14px; }
      .success { background: #dcfce7; border-left: 4px solid #22c55e; padding: 15px 20px; border-radius: 0 8px 8px 0; margin: 20px 0; }
      .success p { color: #166534; margin: 0; font-size: 14px; }
      .role-badge { display: inline-block; background: linear-gradient(135deg, #0891B2 0%, #0E7490 100%); color: #ffffff; padding: 8px 20px; border-radius: 20px; font-size: 14px; font-weight: 600; }
      .footer { background: #f8fafc; padding: 25px 30px; text-align: center; border-top: 1px solid #e2e8f0; }
      .footer p { color: #94a3b8; margin: 5px 0; font-size: 12px; }
      .footer a { color: #0891B2; text-decoration: none; }
      ul { color: #64748b; line-height: 1.8; padding-left: 20px; }
    </style>
  `;

  const loginUrl = data.loginUrl || "https://your-app.com/auth";

  switch (type) {
    case "confirmation":
    case "resend_confirmation":
      return {
        subject: "🔬 LabLink - Verify Your Email Address",
        html: `<!DOCTYPE html><html><head><meta charset="utf-8">${styles}</head><body>
<div class="container">
  <div class="header"><h1>🔬 LabLink</h1><p>Lab Inventory Management System</p></div>
  <div class="content">
    <h2>Welcome, ${data.name}! 👋</h2>
    <p>Thank you for registering with LabLink. Please verify your email address by clicking the button below:</p>
    <div style="text-align:center;"><a href="${data.confirmationLink}" class="button">✓ Verify My Email</a></div>
    <div class="warning"><p>⏰ This verification link will expire in 24 hours.</p></div>
    <p style="color:#94a3b8;font-size:14px;text-align:center;">If you didn't create an account, you can safely ignore this email.</p>
  </div>
  <div class="footer"><p>Need help? Contact your administrator</p><p>© 2025 LabLink - Lab Inventory System</p></div>
</div></body></html>`
      };

    case "credentials":
      return {
        subject: "🔐 LabLink - Your Login Credentials",
        html: `<!DOCTYPE html><html><head><meta charset="utf-8">${styles}</head><body>
<div class="container">
  <div class="header"><h1>🔬 LabLink</h1><p>Lab Inventory Management System</p></div>
  <div class="content">
    <h2>Hello, ${data.name}! 👋</h2>
    <p>Your LabLink account has been created. Here are your login credentials:</p>
    <div class="cred-box">
      <div class="cred-item"><p class="cred-label">Email</p><p class="cred-value">${data.email || data.to}</p></div>
      <div class="cred-item"><p class="cred-label">Password</p><p class="cred-value">${data.password || '********'}</p></div>
      <div class="cred-item"><p class="cred-label">Role</p><p class="cred-value">${data.role || 'User'}</p></div>
    </div>
    <div class="warning"><p>⚠️ <strong>Important:</strong> Please change your password after first login for security.</p></div>
    <div style="text-align:center;"><a href="${loginUrl}" class="button">🔐 Login to LabLink</a></div>
  </div>
  <div class="footer"><p>Keep this email safe - it contains your login details</p><p>© 2025 LabLink</p></div>
</div></body></html>`
      };

    case "activation":
    case "welcome_student":
      return {
        subject: "🎉 LabLink - Your Account is Now Active!",
        html: `<!DOCTYPE html><html><head><meta charset="utf-8">${styles}</head><body>
<div class="container">
  <div class="header"><h1>🔬 LabLink</h1><p>Lab Inventory Management System</p></div>
  <div class="content">
    <div class="success"><p>✅ <strong>Your account has been activated!</strong></p></div>
    <h2 style="text-align:center;">Welcome to LabLink, ${data.name}! 🎉</h2>
    <p style="text-align:center;">Your student account is now active. You can log in and start using the system.</p>
    <div class="cred-box">
      <div class="cred-item"><p class="cred-label">Login Email</p><p class="cred-value">${data.email || data.to}</p></div>
    </div>
    <h3 style="color:#1e293b;font-size:16px;margin:25px 0 10px;">🚀 What You Can Do</h3>
    <ul>
      <li>Browse available lab equipment</li>
      <li>Submit borrow requests</li>
      <li>Track your active borrowings</li>
      <li>Receive notifications for approvals</li>
    </ul>
    <div style="text-align:center;"><a href="${loginUrl}" class="button">🔐 Login Now</a></div>
  </div>
  <div class="footer"><p>Need help? Contact your lab administrator</p><p>© 2025 LabLink</p></div>
</div></body></html>`
      };

    case "welcome_staff":
      const roleDesc = data.role === "Staff" 
        ? "<li>Manage inventory items</li><li>Approve borrow requests</li><li>Issue and receive items</li><li>Generate reports</li>"
        : data.role === "Technician"
        ? "<li>Handle maintenance requests</li><li>Update equipment status</li><li>Log repair activities</li><li>Mark items repaired/scrapped</li>"
        : "<li>Full system administration</li><li>Manage users and roles</li><li>Configure system settings</li><li>Access all reports</li>";
      
      return {
        subject: `🔬 LabLink - Your ${data.role || 'Staff'} Account is Ready`,
        html: `<!DOCTYPE html><html><head><meta charset="utf-8">${styles}</head><body>
<div class="container">
  <div class="header"><h1>🔬 LabLink</h1><p>Lab Inventory Management System</p></div>
  <div class="content">
    <h2 style="text-align:center;">Welcome to the Team, ${data.name}! 👋</h2>
    <p style="text-align:center;">Your account has been created by the administrator.</p>
    <div style="text-align:center;margin:20px 0;"><span class="role-badge">${data.role || 'Staff'}</span></div>
    <div class="cred-box">
      <div class="cred-item"><p class="cred-label">Login Email</p><p class="cred-value">${data.email || data.to}</p></div>
      ${data.password ? `<div class="cred-item"><p class="cred-label">Temporary Password</p><p class="cred-value">${data.password}</p></div>` : ''}
    </div>
    <div class="warning"><p>⚠️ <strong>Important:</strong> Please change your password after first login.</p></div>
    <h3 style="color:#1e293b;font-size:16px;margin:25px 0 10px;">📋 Your Permissions Include</h3>
    <ul>${roleDesc}</ul>
    <div style="text-align:center;"><a href="${loginUrl}" class="button">🔐 Login to LabLink</a></div>
  </div>
  <div class="footer"><p>Questions? Contact your administrator</p><p>© 2025 LabLink</p></div>
</div></body></html>`
      };

    case "password_reset":
      return {
        subject: "🔐 LabLink - Password Reset Request",
        html: `<!DOCTYPE html><html><head><meta charset="utf-8">${styles}</head><body>
<div class="container">
  <div class="header"><h1>🔬 LabLink</h1><p>Lab Inventory Management System</p></div>
  <div class="content">
    <h2>Password Reset Request 🔐</h2>
    <p>Hi ${data.name}, we received a request to reset your password. Click the button below to set a new password:</p>
    <div style="text-align:center;"><a href="${data.confirmationLink}" class="button">Reset Password</a></div>
    <div class="warning"><p>⏰ This link expires in 1 hour. If you didn't request this, ignore this email.</p></div>
  </div>
  <div class="footer"><p>© 2025 LabLink</p></div>
</div></body></html>`
      };

    default:
      return { 
        subject: "LabLink Notification", 
        html: `<p>Hello ${data.name}, you have a notification from LabLink.</p>` 
      };
  }
};

const handler = async (req: Request): Promise<Response> => {
  console.log("=== Send Email Function Called (Gmail SMTP) ===");
  
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    // Get Gmail credentials from environment
    const GMAIL_USER = Deno.env.get("GMAIL_USER");
    const GMAIL_APP_PASSWORD = Deno.env.get("GMAIL_APP_PASSWORD");
    
    console.log("Gmail user configured:", !!GMAIL_USER);
    console.log("Gmail password configured:", !!GMAIL_APP_PASSWORD);

    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      console.error("Gmail credentials not configured!");
      console.error("Please set GMAIL_USER and GMAIL_APP_PASSWORD in Supabase Edge Function secrets");
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Email service not configured. Admin needs to set GMAIL_USER and GMAIL_APP_PASSWORD in Supabase secrets." 
        }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const emailData: EmailRequest = await req.json();
    console.log(`Email type: ${emailData.type}, To: ${emailData.to}, Name: ${emailData.name}`);

    const { subject, html } = getEmailTemplate(emailData.type, emailData);
    console.log("Subject:", subject);

    // Connect to Gmail SMTP
    console.log("Connecting to Gmail SMTP...");
    const client = new SmtpClient();
    
    await client.connectTLS({
      hostname: "smtp.gmail.com",
      port: 465,
      username: GMAIL_USER,
      password: GMAIL_APP_PASSWORD,
    });

    console.log("Connected! Sending email...");

    // Send email
    await client.send({
      from: `LabLink System <${GMAIL_USER}>`,
      to: emailData.to,
      subject: subject,
      content: "Please view this email in an HTML-compatible email client.",
      html: html,
    });

    await client.close();
    
    console.log("✅ Email sent successfully to:", emailData.to);

    return new Response(
      JSON.stringify({ success: true, message: `Email sent successfully to ${emailData.to}` }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("❌ Email error:", error.message);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
