import type { Menu, MenuItem } from './menu.ts';
import type {
  NormalizedItem,
  RequestedOrder,
  SelectedModifier,
  ValidateResult,
  ValidationError,
} from './order.ts';

export function validateOrder(
  menu: Menu,
  requested: RequestedOrder,
  opts: { now?: Date } = {},
): ValidateResult {
  const errors: ValidationError[] = [];
  const items: NormalizedItem[] = [];
  const byId = new Map(menu.items.map((item) => [item.id, item]));

  requested.items.forEach((line, itemIndex) => {
    const menuItem = byId.get(line.menuItemId);
    if (!menuItem) {
      errors.push({ code: 'UNKNOWN_ITEM', message: `No menu item '${line.menuItemId}'`, itemIndex });
      return;
    }
    if (!menuItem.available) {
      errors.push({ code: 'ITEM_UNAVAILABLE', message: `${menuItem.name} is 86'd`, itemIndex });
      return;
    }
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      errors.push({ code: 'INVALID_QUANTITY', message: `${menuItem.name}: quantity must be a positive integer`, itemIndex });
      return;
    }

    const resolved = resolveModifiers(menuItem, line.modifierOptionIds, itemIndex);
    if (resolved.errors.length > 0) {
      errors.push(...resolved.errors);
      return;
    }

    const unitPriceCents =
      menuItem.priceCents + resolved.modifiers.reduce((sum, modifier) => sum + modifier.priceCents, 0);
    items.push({
      menuItemId: menuItem.id,
      name: menuItem.name,
      quantity: line.quantity,
      modifiers: resolved.modifiers,
      unitPriceCents,
      lineTotalCents: unitPriceCents * line.quantity,
    });
  });

  if (errors.length > 0) return { ok: false, errors };

  const subtotalCents = items.reduce((sum, item) => sum + item.lineTotalCents, 0);
  return {
    ok: true,
    order: {
      tenantId: requested.tenantId,
      channel: requested.channel,
      status: 'confirmed',
      items,
      subtotalCents,
      createdAt: (opts.now ?? new Date()).toISOString(),
    },
  };
}

function resolveModifiers(
  item: MenuItem,
  optionIds: string[],
  itemIndex: number,
): { modifiers: SelectedModifier[]; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  const modifiers: SelectedModifier[] = [];
  const optionIndex = new Map(
    item.modifierGroups.flatMap((group) => group.options.map((option) => [option.id, { group, option }] as const)),
  );
  const countByGroup = new Map<string, number>();

  for (const id of optionIds) {
    const match = optionIndex.get(id);
    if (!match) {
      errors.push({ code: 'UNKNOWN_MODIFIER', message: `Modifier '${id}' is not valid for ${item.name}`, itemIndex });
      continue;
    }
    modifiers.push({ id: match.option.id, name: match.option.name, priceCents: match.option.priceCents });
    countByGroup.set(match.group.id, (countByGroup.get(match.group.id) ?? 0) + 1);
  }

  for (const group of item.modifierGroups) {
    const count = countByGroup.get(group.id) ?? 0;
    if (count < group.minSelect || count > group.maxSelect) {
      errors.push({
        code: 'MODIFIER_CONSTRAINT',
        message: `${item.name} · ${group.name}: choose ${group.minSelect}-${group.maxSelect}, got ${count}`,
        itemIndex,
      });
    }
  }

  return { modifiers, errors };
}
