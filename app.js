import React, { useState, useEffect } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import TextInput from 'ink-text-input';
import Fuse from 'fuse.js';
import { searchRestaurants, findNearbyStores, getMenuAsync } from './dd-cli.js';
import { renderImage, renderImages } from './images.js';

// -- Dietary filter keywords --------------------------------------------------

const DIETARY_FILTERS = {
  veg:         /\b(vegetarian|veggie|veg\b|paneer|tofu|mushroom|vegeta)/i,
  vegan:       /\b(vegan|plant.?based|impossible|beyond)\b/i,
  'gluten-free': /\b(gluten.?free|gf\b|celiac)\b/i,
  'dairy-free':  /\b(dairy.?free|no dairy|non.?dairy|oat milk|almond milk|coconut milk)\b/i,
  spicy:       /\b(spicy|hot|chili|chilli|jalapeno|sriracha|habanero|ghost pepper)\b/i,
  seafood:     /\b(fish|shrimp|prawn|salmon|tuna|crab|lobster|seafood|sushi|sashimi|calamari)\b/i,
};

function matchesDiet(item, filter) {
  if (!filter || filter === 'all') return true;
  const pattern = DIETARY_FILTERS[filter];
  if (!pattern) return true;
  const text = `${item.name || ''} ${item.description || ''}`;
  return pattern.test(text);
}

// -- Stars renderer -----------------------------------------------------------

function stars(rating) {
  if (!rating) return '';
  const full = Math.floor(rating);
  const half = rating - full >= 0.5 ? 1 : 0;
  return '*'.repeat(full) + (half ? '.5' : '') + ' '.repeat(5 - full - half);
}

// -- Store card ---------------------------------------------------------------

function StoreCard({ store, imageStr, selected, lite }) {
  if (lite) {
    const sel = selected ? '> ' : '  ';
    const name = (store.name || store.verified_name || '').padEnd(28).slice(0, 28);
    const rating = store.rating ? `${store.rating}` : '   ';
    const dist = store.distance || (store.distance_meters ? `${(store.distance_meters / 1609).toFixed(1)} mi` : '');
    const eta = store.delivery_time || '';

    return React.createElement(Text, {
      color: selected ? 'cyan' : 'white',
      bold: selected,
    }, `${sel}${name}  ${rating.padEnd(4)} ${dist.padEnd(8)} ${eta.padEnd(8)} (${store.store_id})`);
  }

  const border = selected ? 'bold' : 'single';
  const borderColor = selected ? 'cyan' : 'gray';

  return (
    React.createElement(Box, {
      borderStyle: border,
      borderColor,
      paddingX: 1,
      flexDirection: 'row',
      gap: 1,
      width: '100%',
    },
      imageStr
        ? React.createElement(Box, { flexShrink: 0 },
            React.createElement(Text, null, imageStr))
        : null,
      React.createElement(Box, { flexDirection: 'column', flexGrow: 1 },
        React.createElement(Text, { bold: true, color: 'white' },
          selected ? '> ' : '  ', store.name || store.verified_name),
        React.createElement(Box, { gap: 2 },
          store.rating
            ? React.createElement(Text, { color: 'yellow' },
                stars(store.rating), ' ', store.rating)
            : null,
          store.review_count
            ? React.createElement(Text, { color: 'gray' },
                `(${store.review_count} reviews)`)
            : null,
        ),
        React.createElement(Box, { gap: 2 },
          store.distance
            ? React.createElement(Text, { color: 'cyan' }, store.distance)
            : store.distance_meters
              ? React.createElement(Text, { color: 'cyan' },
                  `${(store.distance_meters / 1609).toFixed(1)} mi`)
              : null,
          store.delivery_time
            ? React.createElement(Text, { color: 'green' }, store.delivery_time)
            : null,
        ),
        React.createElement(Text, { color: 'gray', dimColor: true },
          `id: ${store.store_id}`),
      )
    )
  );
}

// -- Menu item row ------------------------------------------------------------

function MenuItem({ item, selected }) {
  const color = selected ? 'cyan' : 'white';
  const prefix = selected ? '> ' : '  ';

  return React.createElement(Box, { flexDirection: 'column', paddingX: 1 },
    React.createElement(Box, { gap: 1 },
      React.createElement(Text, { bold: selected, color },
        prefix, item.name),
      React.createElement(Text, { color: 'green' },
        item.price != null ? `$${item.price.toFixed(2)}` : ''),
      !item.is_orderable
        ? React.createElement(Text, { color: 'red', dimColor: true }, '[unavailable]')
        : null,
    ),
    item.description
      ? React.createElement(Text, { color: 'gray', dimColor: true, wrap: 'truncate' },
          `  ${item.description}`)
      : null,
  );
}

// -- Main App -----------------------------------------------------------------

export default function App({ query, mode, lite }) {
  const { exit } = useApp();
  const [phase, setPhase] = useState(query ? 'loading' : 'input');
  const [searchQuery, setSearchQuery] = useState(query || '');
  const [stores, setStores] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [images, setImages] = useState(new Map());
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filterText, setFilterText] = useState('');
  const [error, setError] = useState(null);
  const [selectedStore, setSelectedStore] = useState(null);
  const [detailImage, setDetailImage] = useState('');
  const [fuse, setFuse] = useState(null);

  // Menu state
  const [menuItems, setMenuItems] = useState([]);
  const [menuFiltered, setMenuFiltered] = useState([]);
  const [menuCategories, setMenuCategories] = useState([]);
  const [menuIndex, setMenuIndex] = useState(0);
  const [menuFilter, setMenuFilter] = useState('');
  const [dietFilter, setDietFilter] = useState('all');
  const [menuFuse, setMenuFuse] = useState(null);
  const [menuStoreName, setMenuStoreName] = useState('');
  const [menuScrollOffset, setMenuScrollOffset] = useState(0);

  const DIET_OPTIONS = ['all', 'veg', 'vegan', 'gluten-free', 'dairy-free', 'spicy', 'seafood'];
  const VISIBLE_ITEMS = 15;

  // -- Fetch store data -------------------------------------------------------
  useEffect(() => {
    if (phase !== 'loading') return;
    try {
      let data;
      if (mode === 'nearby') {
        data = findNearbyStores({ vertical: searchQuery || 'grocery' });
      } else {
        data = searchRestaurants(searchQuery);
      }
      const storeList = data.stores || [];
      if (storeList.length === 0) {
        setError('No results found.');
        setPhase('error');
        return;
      }
      setStores(storeList);
      setFiltered(storeList);
      setFuse(new Fuse(storeList, {
        keys: ['name', 'verified_name'],
        threshold: 0.4,
      }));

      if (lite) {
        // Skip image loading entirely
        setPhase('browse');
      } else {
        setPhase('images');
        const urls = storeList.map(s => s.image_url).filter(Boolean);
        renderImages(urls, { width: 48, height: 20 }).then(imgMap => {
          setImages(imgMap);
          setPhase('browse');
        }).catch(() => setPhase('browse'));
      }
    } catch (e) {
      setError(e.message || 'Failed to fetch data');
      setPhase('error');
    }
  }, [phase]);

  // -- Fetch menu data --------------------------------------------------------
  useEffect(() => {
    if (phase !== 'menu-loading') return;
    let cancelled = false;

    getMenuAsync(selectedStore.store_id)
      .then(data => {
        if (cancelled) return;
        const items = data.items || [];
        setMenuStoreName(data.store_name || selectedStore.name || '');
        setMenuItems(items);
        setMenuFiltered(items);
        setMenuCategories([...new Set(items.map(i => i.category_name).filter(Boolean))]);
        setMenuFuse(new Fuse(items, {
          keys: ['name', 'description', 'category_name'],
          threshold: 0.35,
        }));
        setMenuFilter('');
        setDietFilter('all');
        setMenuIndex(0);
        setMenuScrollOffset(0);
        setPhase('menu');
      })
      .catch(e => {
        if (cancelled) return;
        setError(`Could not load menu: ${e.message}`);
        setPhase('error');
      });

    return () => { cancelled = true; };
  }, [phase]);

  // -- React to menu filter / diet changes ------------------------------------
  useEffect(() => {
    if (phase !== 'menu') return;
    if (menuItems.length === 0) return;

    let result = menuItems;
    if (menuFilter) {
      if (menuFuse) {
        result = menuFuse.search(menuFilter).map(r => r.item);
      } else {
        const lower = menuFilter.toLowerCase();
        result = menuItems.filter(i =>
          (i.name || '').toLowerCase().includes(lower) ||
          (i.description || '').toLowerCase().includes(lower) ||
          (i.category_name || '').toLowerCase().includes(lower)
        );
      }
    }
    result = result.filter(i => matchesDiet(i, dietFilter));
    setMenuFiltered(result);
    setMenuIndex(0);
    setMenuScrollOffset(0);
  }, [menuFilter, dietFilter, phase]);

  // -- Filter stores ----------------------------------------------------------
  useEffect(() => {
    if (!fuse || phase !== 'browse') return;
    if (!filterText) {
      setFiltered(stores);
    } else {
      setFiltered(fuse.search(filterText).map(r => r.item));
    }
    setSelectedIndex(0);
  }, [filterText]);

  // -- Keyboard input ---------------------------------------------------------
  useInput((input, key) => {

    // Quit from error
    if (phase === 'error' && input === 'q') { exit(); return; }

    // Search input
    if (phase === 'input' && key.return) {
      if (searchQuery.trim()) setPhase('loading');
      return;
    }

    // Store browse
    if (phase === 'browse') {
      if (key.upArrow) {
        setSelectedIndex(i => Math.max(0, i - 1));
      } else if (key.downArrow) {
        setSelectedIndex(i => Math.min(filtered.length - 1, i + 1));
      } else if (key.return) {
        if (filtered[selectedIndex]) {
          const store = filtered[selectedIndex];
          setSelectedStore(store);
          setDetailImage('');
          setPhase('selected');
          if (!lite && store.image_url) {
            renderImage(store.image_url, { width: 80, height: 30 })
              .then(img => setDetailImage(img))
              .catch(() => {});
          }
        }
      } else if (key.escape) {
        setFilterText('');
        setPhase('input');
        setSearchQuery('');
      }
      return;
    }

    // Store detail
    if (phase === 'selected') {
      if (key.escape || input === 'b') {
        setSelectedStore(null);
        setPhase('browse');
      } else if (input === 'm' || key.return) {
        // Open menu
        setMenuFilter('');
        setDietFilter('all');
        setMenuIndex(0);
        setMenuScrollOffset(0);
        setPhase('menu-loading');
      }
      return;
    }

    // Menu browse -- only handle special keys; let TextInput handle characters
    if (phase === 'menu') {
      if (key.upArrow) {
        setMenuIndex(i => {
          const next = Math.max(0, i - 1);
          if (next < menuScrollOffset) setMenuScrollOffset(next);
          return next;
        });
      } else if (key.downArrow) {
        setMenuIndex(i => {
          const next = Math.min(menuFiltered.length - 1, i + 1);
          if (next >= menuScrollOffset + VISIBLE_ITEMS) setMenuScrollOffset(next - VISIBLE_ITEMS + 1);
          return next;
        });
      } else if (key.tab) {
        const idx = DIET_OPTIONS.indexOf(dietFilter);
        setDietFilter(DIET_OPTIONS[(idx + 1) % DIET_OPTIONS.length]);
      } else if (key.escape) {
        setPhase('selected');
      }
      // No return here -- let character input reach TextInput
    }
  });

  // -- Render: error ----------------------------------------------------------
  if (phase === 'error') {
    return React.createElement(Box, { flexDirection: 'column', padding: 1 },
      React.createElement(Text, { color: 'red' }, 'Error: ', error),
      React.createElement(Text, { color: 'gray' }, 'Press q to quit'),
    );
  }

  // -- Render: search input ---------------------------------------------------
  if (phase === 'input') {
    return React.createElement(Box, { flexDirection: 'column', padding: 1 },
      React.createElement(Text, { bold: true, color: 'cyan' },
        mode === 'nearby' ? 'Find nearby stores' : 'Search restaurants'),
      React.createElement(Box, { marginTop: 1 },
        React.createElement(Text, { color: 'yellow' },
          mode === 'nearby' ? 'Vertical (grocery/alcohol/retail): ' : 'Search: '),
        React.createElement(TextInput, {
          value: searchQuery,
          onChange: setSearchQuery,
        }),
      ),
      React.createElement(Text, { color: 'gray', marginTop: 1 },
        'Press Enter to search'),
    );
  }

  // -- Render: loading --------------------------------------------------------
  if (phase === 'loading') {
    return React.createElement(Box, { padding: 1 },
      React.createElement(Text, { color: 'cyan' },
        'Searching for "', searchQuery, '"...'),
    );
  }

  if (phase === 'images') {
    return React.createElement(Box, { padding: 1 },
      React.createElement(Text, { color: 'cyan' },
        `Found ${stores.length} results. Loading images...`),
    );
  }

  // -- Render: store detail ---------------------------------------------------
  if (phase === 'selected' && selectedStore) {
    const img = lite ? '' : (detailImage || images.get(selectedStore.image_url) || '');
    return React.createElement(Box, { flexDirection: 'column', padding: 1 },
      React.createElement(Text, { bold: true, color: 'cyan', underline: true },
        selectedStore.name || selectedStore.verified_name),
      img
        ? React.createElement(Box, { marginY: 1 },
            React.createElement(Text, null, img))
        : null,
      React.createElement(Box, { flexDirection: 'column', gap: 0, marginTop: 1 },
        React.createElement(Text, null,
          'Rating:    ',
          React.createElement(Text, { color: 'yellow' },
            `${selectedStore.rating || 'N/A'} ${stars(selectedStore.rating)}`)),
        React.createElement(Text, null,
          'Reviews:   ',
          React.createElement(Text, { color: 'white' },
            String(selectedStore.review_count || 'N/A'))),
        React.createElement(Text, null,
          'Distance:  ',
          React.createElement(Text, { color: 'cyan' },
            selectedStore.distance ||
            (selectedStore.distance_meters
              ? `${(selectedStore.distance_meters / 1609).toFixed(1)} mi`
              : 'N/A'))),
        React.createElement(Text, null,
          'Delivery:  ',
          React.createElement(Text, { color: 'green' },
            selectedStore.delivery_time || 'N/A')),
        React.createElement(Text, null,
          'Store ID:  ',
          React.createElement(Text, { color: 'gray' },
            selectedStore.store_id)),
      ),
      React.createElement(Box, { marginTop: 1, flexDirection: 'column' },
        React.createElement(Text, { color: 'gray' },
          'Enter/m  View menu   |   Esc/b  Back to results'),
      ),
    );
  }

  // -- Render: menu loading ---------------------------------------------------
  if (phase === 'menu-loading') {
    return React.createElement(Box, { padding: 1 },
      React.createElement(Text, { color: 'cyan' },
        `Loading menu for ${selectedStore?.name || 'store'}...`),
    );
  }

  // -- Render: menu -----------------------------------------------------------
  if (phase === 'menu') {
    const visible = menuFiltered.slice(menuScrollOffset, menuScrollOffset + VISIBLE_ITEMS);

    return React.createElement(Box, { flexDirection: 'column', padding: 1 },
      // Header
      React.createElement(Text, { bold: true, color: 'cyan' },
        `${menuStoreName} — Menu`),

      // Filter row
      React.createElement(Box, { marginTop: 1, gap: 1 },
        React.createElement(Text, { color: 'yellow' }, 'Filter: '),
        React.createElement(TextInput, {
          value: menuFilter,
          onChange: setMenuFilter,
          placeholder: 'type to search menu...',
          focus: true,
        }),
      ),

      // Diet filter
      React.createElement(Box, { gap: 1 },
        React.createElement(Text, { color: 'gray' }, 'Diet [Tab]: '),
        ...DIET_OPTIONS.map(opt =>
          React.createElement(Text, {
            key: opt,
            color: dietFilter === opt ? 'cyan' : 'gray',
            bold: dietFilter === opt,
            dimColor: dietFilter !== opt,
          }, dietFilter === opt ? `[${opt}]` : opt)
        ),
      ),

      // Counts
      React.createElement(Text, { color: 'gray', dimColor: true },
        `${menuFiltered.length} items`,
        menuFiltered.length !== menuItems.length
          ? ` (of ${menuItems.length} total)`
          : '',
        menuCategories.length > 0
          ? ` across ${menuCategories.length} categories`
          : ''),

      // Separator
      React.createElement(Box, { marginY: 0 },
        React.createElement(Text, { color: 'gray', dimColor: true },
          '-'.repeat(60))),

      // Items
      ...visible.map((item, i) => {
        const globalIdx = menuScrollOffset + i;
        return React.createElement(MenuItem, {
          key: item.item_id || globalIdx,
          item,
          selected: globalIdx === menuIndex,
        });
      }),

      // Scroll indicator
      menuFiltered.length > VISIBLE_ITEMS
        ? React.createElement(Text, { color: 'gray', dimColor: true },
            `  ... ${menuScrollOffset + 1}-${Math.min(menuScrollOffset + VISIBLE_ITEMS, menuFiltered.length)} of ${menuFiltered.length}`)
        : null,

      // Footer
      React.createElement(Box, { marginTop: 1 },
        React.createElement(Text, { color: 'gray' },
          'Up/Down  Navigate   |   Tab  Cycle diet filter   |   Esc  Back'),
      ),
    );
  }

  // -- Render: store browse ---------------------------------------------------
  const maxVisible = lite ? 15 : 8;
  return React.createElement(Box, { flexDirection: 'column', padding: 1 },
    lite
      ? React.createElement(Box, { marginBottom: 1, flexDirection: 'column' },
          React.createElement(Text, { color: 'gray', dimColor: true },
            '  Name                          Rate Distance Delivery'),
          React.createElement(Text, { color: 'gray', dimColor: true },
            '-'.repeat(70)),
        )
      : null,
    React.createElement(Box, { marginBottom: lite ? 0 : 1 },
      React.createElement(Text, { color: 'yellow' }, 'Filter: '),
      React.createElement(TextInput, {
        value: filterText,
        onChange: setFilterText,
        placeholder: 'type to filter...',
      }),
      React.createElement(Text, { color: 'gray' },
        `  (${filtered.length}/${stores.length})`),
    ),
    ...filtered.slice(0, maxVisible).map((store, i) =>
      React.createElement(StoreCard, {
        key: store.store_id,
        store,
        imageStr: lite ? '' : (images.get(store.image_url) || ''),
        selected: i === selectedIndex,
        lite,
      })
    ),
    React.createElement(Box, { marginTop: 1 },
      React.createElement(Text, { color: 'gray' },
        'Up/Down  Navigate   |   Enter  Select   |   Esc  New search'),
    ),
  );
}
