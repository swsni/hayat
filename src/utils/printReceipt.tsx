import React from 'react';
import { createRoot } from 'react-dom/client';
import ReceiptPrintTemplate, { ReceiptPrintData } from '../components/ReceiptPrintTemplate';

export async function printReceipt(data: ReceiptPrintData): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      // Create an invisible iframe
      const iframe = document.createElement('iframe');
      iframe.style.position = 'absolute';
      iframe.style.width = '0px';
      iframe.style.height = '0px';
      iframe.style.border = 'none';
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow?.document;
      if (!doc) {
        throw new Error('Could not access iframe document');
      }

      // Initialize iframe document with styles
      doc.open();
      doc.write('<!DOCTYPE html><html><head><title>Print Receipt</title>');
      // Pre-load the Arabic/English Google font that looks professional
      doc.write('<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet">');
      doc.write(`
        <style>
          body { 
            font-family: 'Cairo', sans-serif; 
            margin: 0; 
            padding: 0; 
            -webkit-print-color-adjust: exact; 
            print-color-adjust: exact;
          }
          @page { size: auto; margin: 0; }
        </style>
      `);
      doc.write('</head><body><div id="print-root"></div></body></html>');
      doc.close();

      const printRoot = doc.getElementById('print-root');
      if (!printRoot) {
        throw new Error('Print root not found');
      }

      // Render the component into the iframe using React 18 createRoot
      const root = createRoot(printRoot);
      root.render(<ReceiptPrintTemplate data={data} />);

      // Wait for fonts, images, and rendering to complete before triggering print
      setTimeout(() => {
        if (iframe.contentWindow) {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        }

        // Cleanup: remove iframe after printing is done/canceled
        // Using a longer timeout to ensure the print dialog is closed
        setTimeout(() => {
          root.unmount();
          document.body.removeChild(iframe);
          resolve();
        }, 1500);
      }, 1000); // 1-second delay ensures the logo image and font network requests complete
      
    } catch (error) {
      console.error('Print failed:', error);
      reject(error);
    }
  });
}
