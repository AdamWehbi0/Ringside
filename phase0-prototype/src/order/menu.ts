export interface ModifierOption {
  id: string;
  name: string;
  priceCents: number;
}

export interface ModifierGroup {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  options: ModifierOption[];
}

export interface MenuItem {
  id: string;
  name: string;
  priceCents: number;
  available: boolean;
  modifierGroups: ModifierGroup[];
}

export interface Menu {
  tenantId: string;
  items: MenuItem[];
}
