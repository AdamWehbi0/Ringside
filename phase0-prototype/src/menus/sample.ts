import type { Menu } from '../order/menu.ts';

export const sampleMenu: Menu = {
  tenantId: 'pilot',
  items: [
    {
      id: 'burger',
      name: 'Cheeseburger',
      priceCents: 1200,
      available: true,
      modifierGroups: [
        {
          id: 'temp',
          name: 'Temperature',
          minSelect: 1,
          maxSelect: 1,
          options: [
            { id: 'temp_rare', name: 'Rare', priceCents: 0 },
            { id: 'temp_medium', name: 'Medium', priceCents: 0 },
            { id: 'temp_well', name: 'Well done', priceCents: 0 },
          ],
        },
        {
          id: 'addons',
          name: 'Add-ons',
          minSelect: 0,
          maxSelect: 3,
          options: [
            { id: 'add_bacon', name: 'Bacon', priceCents: 250 },
            { id: 'add_cheese', name: 'Extra cheese', priceCents: 150 },
            { id: 'add_avocado', name: 'Avocado', priceCents: 200 },
          ],
        },
      ],
    },
    {
      id: 'fries',
      name: 'Fries',
      priceCents: 500,
      available: true,
      modifierGroups: [
        {
          id: 'size',
          name: 'Size',
          minSelect: 1,
          maxSelect: 1,
          options: [
            { id: 'size_small', name: 'Small', priceCents: 0 },
            { id: 'size_large', name: 'Large', priceCents: 200 },
          ],
        },
      ],
    },
    {
      id: 'shake',
      name: 'Milkshake',
      priceCents: 600,
      available: false,
      modifierGroups: [],
    },
  ],
};
