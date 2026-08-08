// Generates a Quotation or Invoice PDF for a client, using their deal
// amount / payment info already tracked on the profile page. Called as a
// direct browser link (GET), same auth pattern as export.js — the token
// can come via ?token= since a plain <a>/window.open can't set headers.

const { createClient } = require('@supabase/supabase-js');
const { requireAuth } = require('./lib/auth');
const { getSetting, DEFAULT_INVOICE_COMPANY_NAME, DEFAULT_INVOICE_COMPANY_CONTACT, DEFAULT_INVOICE_COMPANY_ADDRESS } = require('./lib/settings');
const PDFDocument = require('pdfkit');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
    const docNumber = `${docType === 'invoice' ? 'INV' : 'QUO'}-${String(client.id).replace(/-/g, '').slice(0, 8).toUpperCase()}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${docType}-${safeFilename(client.name)}.pdf"`);

    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    doc.pipe(res);

    // ---- Header: company details ----
    doc.fontSize(20).fillColor('#2952e3').text(companyName || 'Company', { continued: false });
    doc.fontSize(10).fillColor('#6b7280');
    if (companyContact) doc.text(companyContact);
    if (companyAddress) doc.text(companyAddress);

    // ---- Document title/meta (top right) ----
    doc.fontSize(16).fillColor('#16181d').text(docType === 'invoice' ? 'INVOICE' : 'QUOTATION', 50, 50, { align: 'right' });
    doc.fontSize(9).fillColor('#6b7280')
      .text(`No: ${docNumber}`, { align: 'right' })
      .text(`Date: ${issueDate}`, { align: 'right' });

    doc.moveDown(2);

    // ---- Bill To ----
    const billToY = doc.y;
    doc.fontSize(9).fillColor('#6b7280').text('BILL TO', 50, billToY);
    doc.fontSize(12).fillColor('#16181d').text(client.name, 50, billToY + 14);
    let y = billToY + 32;
    doc.fontSize(10).fillColor('#6b7280');
    if (businessType) { doc.text(businessType, 50, y); y += 14; }
    if (client.phone_number) { doc.text(client.phone_number, 50, y); y += 14; }
    if (client.address) { doc.text(client.address, 50, y, { width: 300 }); y += 14; }
    if (client.deal_deadline) { doc.text(`Project deadline: ${client.deal_deadline}`, 50, y); y += 14; }

    doc.y = y + 20;

    // ---- Line item table ----
    const tableTop = doc.y;
    doc.fontSize(9).fillColor('#6b7280');
    doc.text('DESCRIPTION', 50, tableTop);
    doc.text('AMOUNT', 450, tableTop, { width: 100, align: 'right' });
    doc.moveTo(50, tableTop + 14).lineTo(550, tableTop + 14).strokeColor('#e4e7ec').stroke();

    const rowY = tableTop + 24;
    doc.fillColor('#16181d').fontSize(11);
    doc.text(`Website & Admin Panel Development${businessType ? ' — ' + businessType : ''}`, 50, rowY, { width: 380 });
    doc.text(money(dealAmount), 450, rowY, { width: 100, align: 'right' });

    doc.moveTo(50, rowY + 26).lineTo(550, rowY + 26).strokeColor('#e4e7ec').stroke();

    let summaryY = rowY + 40;
    doc.fontSize(11).fillColor('#16181d');
    doc.text('Total', 350, summaryY, { width: 100, align: 'right' });
    doc.text(money(dealAmount), 450, summaryY, { width: 100, align: 'right' });

    if (docType === 'invoice') {
      summaryY += 20;
      doc.fontSize(10).fillColor('#6b7280');
      doc.text('Amount Paid', 350, summaryY, { width: 100, align: 'right' });
      doc.text(money(amountPaid), 450, summaryY, { width: 100, align: 'right' });

      summaryY += 20;
      doc.fontSize(11).fillColor(balanceDue > 0 ? '#dc2626' : '#1e8f5a');
      doc.text('Balance Due', 350, summaryY, { width: 100, align: 'right' });
      doc.text(money(balanceDue), 450, summaryY, { width: 100, align: 'right' });
    }

    doc.moveDown(6);
    doc.fontSize(9).fillColor('#6b7280').text(
      docType === 'invoice'
        ? 'Thank you for your business!'
        : 'This quotation is valid for 15 days from the date of issue.',
      50
    );

    doc.end();
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
};
