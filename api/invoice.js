// Generates a Quotation or Invoice PDF for a client, using their deal
// amount / payment info already tracked on the profile page. Called as a
// direct browser link (GET), same auth pattern as export.js — the token
// can come via ?token= since a plain <a>/window.open can't set headers.

const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const { requireAuth } = require('./lib/auth');
const { getSetting, DEFAULT_INVOICE_COMPANY_NAME, DEFAULT_INVOICE_COMPANY_CONTACT, DEFAULT_INVOICE_COMPANY_ADDRESS } = require('./lib/settings');
const PDFDocument = require('pdfkit');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const LOGO_PATH = path.join(__dirname, '../public/assets/logo.png');

function money(n) {
  return 'Rs. ' + Number(n || 0).toLocaleString('en-IN');
}

function safeFilename(s) {
  return (s || 'client').replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-');
}

module.exports = async (req, res) => {
  if (req.query.token && !req.headers['x-admin-token']) {
    req.headers['x-admin-token'] = req.query.token;
  }
  const user = requireAuth(req, res);
  if (!user) return;

  const { client_id } = req.query;
  const docType = req.query.type === 'invoice' ? 'invoice' : 'quotation';
  if (!client_id) return res.status(400).json({ error: 'client_id is required' });

  try {
    const { data: client, error } = await supabase
      .from('clients')
      .select('id, name, phone_number, address, deal_amount, amount_paid, payment_status, deal_deadline, categories(name)')
      .eq('id', client_id)
      .single();
    if (error || !client) return res.status(404).json({ error: 'Client not found' });

    const [companyName, companyContact, companyAddress] = await Promise.all([
      getSetting('invoice_company_name', DEFAULT_INVOICE_COMPANY_NAME),
      getSetting('invoice_company_contact', DEFAULT_INVOICE_COMPANY_CONTACT),
      getSetting('invoice_company_address', DEFAULT_INVOICE_COMPANY_ADDRESS),
    ]);

    const businessType = client.categories ? client.categories.name : '';
    const dealAmount = Number(client.deal_amount) || 0;
    const amountPaid = Number(client.amount_paid) || 0;
    const balanceDue = Math.max(dealAmount - amountPaid, 0);
    const issueDate = new Date().toLocaleDateString('en-IN');
    const docPrefix = docType === 'invoice' ? 'INV' : 'QUO';
    const docNumber = `${docPrefix}-${String(client.id).replace(/-/g, '').slice(0, 8).toUpperCase()}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
    const accent = docType === 'invoice' ? '#2952e3' : '#0ea5a5';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${docType}-${safeFilename(client.name)}.pdf"`);

    const doc = new PDFDocument({ size: 'A4', margin: 0 });
    doc.pipe(res);

    const M = 50; // page margin
    const PAGE_W = 595.28; // A4 width in points
    const contentW = PAGE_W - M * 2;

    // ---- Header: logo + document type/number/date ----
    try {
      doc.image(LOGO_PATH, M, 40, { width: 150 });
    } catch (e) {
      doc.fontSize(18).fillColor(accent).text(companyName || 'Company', M, 45);
    }

    doc.fontSize(20).fillColor('#16181d').text(docType === 'invoice' ? 'INVOICE' : 'QUOTATION', M, 45, { width: contentW, align: 'right' });
    doc.fontSize(9).fillColor('#6b7280');
    doc.text(`No: ${docNumber}`, M, 70, { width: contentW, align: 'right' });
    doc.text(`Date: ${issueDate}`, M, 83, { width: contentW, align: 'right' });

    let y = 105;
    doc.fontSize(9).fillColor('#6b7280');
    if (companyContact) { doc.text(companyContact, M, y, { width: 300 }); y += 13; }
    if (companyAddress) { doc.text(companyAddress, M, y, { width: 300 }); y += 13; }

    y = Math.max(y, 105) + 12;
    doc.moveTo(M, y).lineTo(PAGE_W - M, y).lineWidth(1.5).strokeColor(accent).stroke();
    y += 24;

    // ---- Bill To card ----
    doc.roundedRect(M, y, contentW, 90, 6).fill('#f4f5f7');
    const pad = 16;
    doc.fontSize(8).fillColor('#6b7280').text('BILL TO', M + pad, y + 14, { characterSpacing: 0.5 });
    doc.fontSize(13).fillColor('#16181d').text(client.name, M + pad, y + 28);
    let by = y + 47;
    const rightColX = M + contentW / 2;
    doc.fontSize(9.5).fillColor('#6b7280');
    doc.text(businessType || '', M + pad, by);
    doc.text(client.phone_number || '', rightColX, by);
    by += 14;
    doc.text(client.address || '', M + pad, by, { width: contentW / 2 - pad - 10 });
    if (client.deal_deadline) doc.text(`Deadline: ${client.deal_deadline}`, rightColX, by);

    y += 90 + 30;

    // ---- Line item table ----
    doc.rect(M, y, contentW, 26).fill('#eef1ff');
    doc.fontSize(8.5).fillColor(accent);
    doc.text('DESCRIPTION', M + 14, y + 9, { characterSpacing: 0.4 });
    doc.text('AMOUNT', M, y + 9, { width: contentW - 14, align: 'right', characterSpacing: 0.4 });

    const rowY = y + 26 + 14;
    doc.fontSize(11).fillColor('#16181d');
    doc.text(`Website & Admin Panel Development${businessType ? ' — ' + businessType : ''}`, M + 14, rowY, { width: contentW - 160 });
    doc.text(money(dealAmount), M, rowY, { width: contentW - 14, align: 'right' });

    y = rowY + 30;
    doc.moveTo(M, y).lineTo(PAGE_W - M, y).lineWidth(0.75).strokeColor('#e4e7ec').stroke();
    y += 18;

    // ---- Summary ----
    const sumLabelX = M + contentW - 220;
    doc.fontSize(11).fillColor('#16181d');
    doc.text('Total', sumLabelX, y, { width: 110, align: 'right' });
    doc.text(money(dealAmount), M, y, { width: contentW - 14, align: 'right' });
    y += 20;

    if (docType === 'invoice') {
      doc.fontSize(10).fillColor('#6b7280');
      doc.text('Amount Paid', sumLabelX, y, { width: 110, align: 'right' });
      doc.text(money(amountPaid), M, y, { width: contentW - 14, align: 'right' });
      y += 22;

      const dueColor = balanceDue > 0 ? '#dc2626' : '#1e8f5a';
      doc.roundedRect(M + contentW - 220, y - 8, 220, 30, 6).fill(balanceDue > 0 ? '#fdf1ef' : '#e6f6ec');
      doc.fontSize(11).fillColor(dueColor);
      doc.text('Balance Due', sumLabelX, y, { width: 110, align: 'right' });
      doc.text(money(balanceDue), M, y, { width: contentW - 14, align: 'right' });
      y += 30;
    }

    y += 40;
    doc.moveTo(M, y).lineTo(PAGE_W - M, y).lineWidth(0.75).strokeColor('#e4e7ec').stroke();
    y += 16;

    doc.fontSize(9).fillColor('#6b7280').text(
      docType === 'invoice' ? `Thank you for choosing ${companyName}!` : 'This quotation is valid for 15 days from the date of issue.',
      M, y, { width: contentW }
    );
    y += 20;
    doc.fontSize(7.5).fillColor('#9ca3af').text(
      `This is a system-generated ${docType} and does not require a signature.`,
      M, y, { width: contentW }
    );

    doc.end();
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
};
