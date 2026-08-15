import React from 'react';
import { useCurrency } from '../LanguageContext';

export interface ReceiptItem {
  description: string;
  validity?: string;
  amount: number;
}

export interface ReceiptPrintData {
  receiptNumber: string;
  date: string;
  customerName: string;
  processedBy?: string;
  items: ReceiptItem[];
  subtotal: number;
  total: number;
  paymentMethod: string;
  status: string;
}

interface Props {
  data: ReceiptPrintData;
}

export default function ReceiptPrintTemplate({ data }: Props) {
  const currency = useCurrency();
  return (
    <div style={{ maxWidth: '400px', margin: '0 auto', textAlign: 'left', fontSize: '12px', lineHeight: '1.5', padding: '20px', color: '#000' }}>
      <div style={{ textAlign: 'center', marginBottom: '20px' }}>
        {/* The logo uses an absolute URL for reliable printing from an iframe */}
        <img src={window.location.origin + "/logoo.png"} alt="Logo" style={{ maxWidth: '120px', marginBottom: '10px' }} />
        <h2 style={{ margin: '0 0 5px 0', fontSize: '18px' }}>Hayat Beauty And Care</h2>
        <p style={{ margin: 0, color: '#555' }}>Shop 3, Building, District 1 Mall, 19 Road 7901</p>
        <p style={{ margin: 0, color: '#555' }}>Janabiya 579 | Phone: 37618888</p>
      </div>

      <div style={{ marginBottom: '15px', borderBottom: '1px dashed #ccc', paddingBottom: '10px' }}>
        <p style={{ margin: '2px 0' }}><strong>Receipt No:</strong> {data.receiptNumber}</p>
        <p style={{ margin: '2px 0' }}><strong>Date:</strong> {data.date}</p>
        <p style={{ margin: '2px 0' }}><strong>Customer:</strong> {data.customerName}</p>
        <p style={{ margin: '2px 0' }}><strong>Processed by:</strong> {data.processedBy || 'Staff'}</p>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '15px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #000' }}>
            <th style={{ textAlign: 'left', padding: '4px 0' }}>Description</th>
            <th style={{ textAlign: 'right', padding: '4px 0' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((item, idx) => (
            <tr key={idx}>
              <td style={{ padding: '4px 0' }}>
                <div style={{ fontWeight: 600 }}>{item.description}</div>
                {item.validity && <div style={{ fontSize: '10px', color: '#666' }}>Validity: {item.validity}</div>}
              </td>
              <td style={{ textAlign: 'right', padding: '4px 0' }}>{item.amount.toFixed(3)} {currency}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ borderTop: '1px dashed #ccc', paddingTop: '10px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span>Subtotal:</span>
          <span>{data.subtotal.toFixed(3)} {currency}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontWeight: 'bold', fontSize: '14px' }}>
          <span>Total Paid:</span>
          <span>{data.total.toFixed(3)} {currency}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
          <span>Payment Method:</span>
          <span>{data.paymentMethod}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Status:</span>
          <span>{data.status}</span>
        </div>
      </div>

      <div style={{ textAlign: 'center', marginTop: '30px', fontSize: '11px', color: '#555' }}>
        <p style={{ margin: '0 0 5px 0' }}>Thank you for your visit!</p>
        <p style={{ margin: 0 }}>Please retain this receipt for your records.</p>
      </div>
    </div>
  );
}
