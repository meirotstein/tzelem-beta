import { describe, expect, it } from 'vitest';
import { buildEquipmentWhatsAppMessage, buildSoldiersWhatsAppMessage } from './sharing';
import { CompanyData } from './types';

const data = {
  soldiers: [
    { row: 2, name: 'דנה', personalNumber: '1', platoon: 'א', active: true },
    { row: 3, name: 'נועם', personalNumber: '2', platoon: 'ב', active: true },
  ],
  equipment: [
    { row: 2, type: 'נשק', number: '100', status: 'משויך', assignedTo: '1', note: '', active: true },
    { row: 3, type: 'משקפת', number: '200', status: 'זמין', assignedTo: '', note: '', active: true },
  ],
} as CompanyData;

describe('WhatsApp sharing', () => {
  it('shares only the supplied filtered soldiers and their equipment', () => {
    const message = buildSoldiersWhatsAppMessage(data, [data.soldiers[0]], {
      query: '', platoon: 'א', equipmentState: 'assigned', showArchived: false,
    });
    expect(message).toContain('מחלקה א · עם צל״ם');
    expect(message).toContain('*דנה*');
    expect(message).toContain('נשק — 100');
    expect(message).not.toContain('נועם');
  });

  it('shares only the supplied filtered equipment with its holder', () => {
    const message = buildEquipmentWhatsAppMessage(data, [data.equipment[0]], {
      query: '', type: 'נשק', status: 'משויך', platoon: 'א', showArchived: false,
    });
    expect(message).toContain('סוג: נשק · סטטוס: משויך · מחלקה א');
    expect(message).toContain('100 — דנה (מחלקה א) · משויך');
    expect(message).not.toContain('200');
  });
});
