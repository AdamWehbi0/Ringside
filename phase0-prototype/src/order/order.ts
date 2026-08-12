export type OrderChannel = 'voice' | 'sms';

export interface RequestedItem {
  menuItemId: string;
  quantity: number;
  modifierOptionIds: string[];
}

export interface RequestedOrder {
  tenantId: string;
  channel: OrderChannel;
  items: RequestedItem[];
}

export interface SelectedModifier {
  id: string;
  name: string;
  priceCents: number;
}

export interface NormalizedItem {
  menuItemId: string;
  name: string;
  quantity: number;
  modifiers: SelectedModifier[];
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface NormalizedOrder {
  tenantId: string;
  channel: OrderChannel;
  status: OrderStatus;
  items: NormalizedItem[];
  subtotalCents: number;
  createdAt: string;
}

export type OrderStatus =
  | 'confirmed'
  | 'pending_payment'
  | 'paid'
  | 'submitted'
  | 'cancelled';

export interface ValidationError {
  code:
    | 'UNKNOWN_ITEM'
    | 'ITEM_UNAVAILABLE'
    | 'INVALID_QUANTITY'
    | 'UNKNOWN_MODIFIER'
    | 'MODIFIER_CONSTRAINT';
  message: string;
  itemIndex: number;
}

export type ValidateResult =
  | { ok: true; order: NormalizedOrder }
  | { ok: false; errors: ValidationError[] };
