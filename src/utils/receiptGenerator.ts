import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { isQatarBranch } from './branchHelpers';
import type { Customer, Invoice } from '../types';

export interface ReceiptData {
  items: Array<{ description: string; amount: number }>;
  receiptNumber?: string;
  date?: number;
  paymentMethod?: string;
  branch?: string;
}

export async function generateReceiptPdf(
  customer: Customer,
  receiptData: ReceiptData
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  // Load Arabic‑supporting font
  let font: any;
  try {
    const fontUrl = 'https://fonts.gstatic.com/s/cairo/v28/SLXgc1nY6HkvalIkTp2mxdt0UX8.woff2';
    const res = await fetch(fontUrl);
    if (!res.ok) throw new Error('Font fetch failed');
    const fontBytes = await res.arrayBuffer();
    font = await pdfDoc.embedFont(fontBytes);
  } catch (e) {
    font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  }

  const page = pdfDoc.addPage([595, 842]); // A4
  const { width, height } = page.getSize();
  const margin = 50;
  let y = height - margin;

  // Add Logo
  try {
    // We try to fetch the logo from the public folder. In dev or prod, /logo.png should be available
    const logoUrl = window.location.origin + '/logoo.png';
    const logoRes = await fetch(logoUrl);
    if (logoRes.ok) {
      const logoBytes = await logoRes.arrayBuffer();
      const logoImage = await pdfDoc.embedPng(logoBytes);
      
      // Scale proportionally to fit within maxWidth and maxHeight
      const maxWidth = 120;
      const maxHeight = 60;
      const widthRatio = maxWidth / logoImage.width;
      const heightRatio = maxHeight / logoImage.height;
      const scaleFactor = Math.min(widthRatio, heightRatio);
      
      const logoWidth = logoImage.width * scaleFactor;
      const logoHeight = logoImage.height * scaleFactor;
      
      // Center the logo
      const logoX = (width - logoWidth) / 2;
      page.drawImage(logoImage, {
        x: logoX,
        y: y - logoHeight,
        width: logoWidth,
        height: logoHeight,
      });
      y -= logoHeight + 20;
    } else {
      throw new Error('Logo not found');
    }
  } catch (e) {
    // Fallback text if logo fails
    const fallbackText = 'Hayat Beauty And Care';
    const fallbackSize = 24;
    const fw = font.widthOfTextAtSize(fallbackText, fallbackSize);
    page.drawText(fallbackText, { x: (width - fw) / 2, y, size: fallbackSize, font, color: rgb(0, 0, 0) });
    y -= 30;
  }

  // Address & Phone (Centered)
  const addressLines = [
    'Hayat Beauty And Care',
    'Shop 3, Building, District 1 Mall, 19 Road 7901, Janabiya 579',
    'Phone: 37618888'
  ];
  
  addressLines.forEach(line => {
    const lw = font.widthOfTextAtSize(line, 10);
    page.drawText(line, { x: (width - lw) / 2, y, size: 10, font, color: rgb(0.2, 0.2, 0.2) });
    y -= 15;
  });
  
  y -= 10;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: rgb(0.8, 0.8, 0.8) });
  y -= 25;

  // Invoice Details Section
  const leftColX = margin;
  const rightColX = width / 2;
  const detailSize = 10;
  const lineHeight = 18;

  // Format Date
  const receiptDate = receiptData.date ? new Date(receiptData.date) : new Date();
  const dateStr = receiptDate.toLocaleDateString('en-GB');
  
  // Format Receipt Number
  let receiptNumStr = receiptData.receiptNumber || '';
  if (receiptNumStr && receiptNumStr.length > 8) {
    receiptNumStr = receiptNumStr.slice(-8).toUpperCase();
  }

  const details = [
    { label: 'Customer:', value: customer.name || 'Walk-in Customer' },
    { label: 'Date:', value: dateStr },
    { label: 'Receipt No:', value: receiptNumStr || 'N/A' },
    { label: 'Payment Method:', value: receiptData.paymentMethod || 'N/A' },
  ];

  details.forEach((d, i) => {
    const x = i % 2 === 0 ? leftColX : rightColX;
    page.drawText(d.label, { x, y, size: detailSize, font, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(d.value, { x: x + 80, y, size: detailSize, font, color: rgb(0, 0, 0) });
    if (i % 2 !== 0) y -= lineHeight;
  });

  if (details.length % 2 !== 0) y -= lineHeight;
  y -= 10;

  // Table Header
  const tableY = y;
  page.drawRectangle({ x: margin, y: tableY - 15, width: width - margin * 2, height: 20, color: rgb(0.95, 0.95, 0.95) });
  
  const colDescriptionX = margin + 10;
  const colAmountX = width - margin - 80;
  
  page.drawText('Description / Package', { x: colDescriptionX, y: tableY - 10, size: 10, font, color: rgb(0, 0, 0) });
  page.drawText('Amount', { x: colAmountX, y: tableY - 10, size: 10, font, color: rgb(0, 0, 0) });
  
  y -= 35;

  // Table Items
  let totalAmount = 0;
  const isQatar = isQatarBranch(receiptData.branch || '');
  const currency = isQatar ? 'QAR' : 'BHD';

  receiptData.items.forEach(item => {
    totalAmount += item.amount;
    page.drawText(item.description, { x: colDescriptionX, y, size: 10, font, color: rgb(0.2, 0.2, 0.2) });
    
    const amtStr = `${item.amount.toFixed(3)} ${currency}`;
    page.drawText(amtStr, { x: colAmountX, y, size: 10, font, color: rgb(0.2, 0.2, 0.2) });
    y -= 20;
  });

  y -= 10;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: rgb(0.8, 0.8, 0.8) });
  y -= 25;

  // Total
  const totalLabel = 'Total Amount:';
  const totalStr = `${totalAmount.toFixed(3)} ${currency}`;
  
  page.drawText(totalLabel, { x: width - margin - 180, y, size: 12, font, color: rgb(0, 0, 0) });
  page.drawText(totalStr, { x: colAmountX, y, size: 12, font, color: rgb(0, 0, 0) });

  // Footer
  y -= 50;
  const footerText = 'Thank you for your visit!';
  const ftWidth = font.widthOfTextAtSize(footerText, 10);
  page.drawText(footerText, { x: (width - ftWidth) / 2, y, size: 10, font, color: rgb(0.5, 0.5, 0.5) });

  return await pdfDoc.save();
}
