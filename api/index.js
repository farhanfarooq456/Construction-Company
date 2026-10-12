require("dotenv").config();
const express = require("express");
const nodemailer = require("nodemailer");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(express.json({ limit: "2mb" }));

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: process.env.SMTP_SECURE === "true",
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

async function verifyLicence(email, key) {
  try {
    const { data, error } = await supabase
      .from("licencekey")
      .select("expiry_date")
      .eq("email", email)
      .eq("licence_key", key)
      .single();

    if (error) console.log("Supabase error:", error.message);
    if (!data) return { ok: false, msg: "Invalid email or licence key" };
    if (new Date(data.expiry_date) < new Date()) return { ok: false, msg: "Licence expired" };
    return { ok: true, expiry: data.expiry_date };
  } catch (e) {
    console.log("verifyLicence crash:", e.message);
    return { ok: false, msg: "Server error" };
  }
}

app.post("/api/login", async (req, res) => {
  const { email, key } = req.body;
  const r = await verifyLicence(email, key);
  if (!r.ok) return res.status(401).json({ error: r.msg });
  res.json({ ok: true, expiry: r.expiry });
});

app.post("/api/send", async (req, res) => {
  const { email, key, recipients, subject, html } = req.body;
  const r = await verifyLicence(email, key);
  if (!r.ok) return res.status(401).json({ error: r.msg });

  const list = recipients.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
  if (!list.length) return res.status(400).json({ error: "No recipients" });

  const results = [];
  for (const to of list) {
    try {
      await transporter.sendMail({ from: process.env.MAIL_FROM, to, subject, html });
      results.push({ to, status: "sent" });
    } catch (e) {
      results.push({ to, status: "failed", error: e.message });
    }
  }
  res.json({ results });
});

if (require.main === module) {
  app.use(express.static("public"));
  app.listen(3000, () => console.log("http://localhost:3000"));
}

module.exports = app;