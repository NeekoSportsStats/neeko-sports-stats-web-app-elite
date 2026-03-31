# MARKET WATCH SAFETY PATTERNS

Quick reference for defensive programming patterns used in the Market Watch fix.

---

## PATTERN 1: SAFE ARRAY OPERATIONS

### ❌ UNSAFE
```ts
players.slice(0, 2)
players.map(p => ...)
players.length === 0
```

### ✅ SAFE
```ts
(players ?? []).slice(0, 2)
players?.map(p => ...) || []
(!players || players.length === 0)
```

---

## PATTERN 2: ERROR HANDLING IN ASYNC CALLS

### ❌ UNSAFE
```ts
const { data } = await supabase.from('table').select('*');
setData(data);
```

### ✅ SAFE
```ts
const { data, error } = await supabase.from('table').select('*');
if (error) {
  console.error('Error:', error);
  setData([]);
} else {
  setData(data ?? []);
}
```

---

## PATTERN 3: FUNCTION PARAMETER NULL SAFETY

### ❌ UNSAFE
```ts
function processData(items: Item[]) {
  return items.map(...);
}
```

### ✅ SAFE
```ts
function processData(items: Item[] | undefined | null) {
  if (!items || !Array.isArray(items)) {
    return [];
  }
  return items.map(...);
}
```

---

## PATTERN 4: EMPTY STATE RENDERING

### ❌ UNSAFE
```ts
return (
  <div>
    {data.map(...)}
  </div>
);
```

### ✅ SAFE
```ts
if (!data || data.length === 0) {
  return <EmptyState />;
}

return (
  <div>
    {data.map(...)}
  </div>
);
```

---

## PATTERN 5: CONDITIONAL RENDERING

### ❌ UNSAFE
```ts
{players.length === 0 && <NoData />}
```

### ✅ SAFE
```ts
{(!players || players.length === 0) && <NoData />}
```

---

## PATTERN 6: TRY-CATCH FOR ENTIRE FETCH

### ❌ UNSAFE
```ts
async function fetchData() {
  const res = await supabase.from('table').select('*');
  setData(res.data);
}
```

### ✅ SAFE
```ts
async function fetchData() {
  try {
    const res = await supabase.from('table').select('*');
    if (res.error) {
      console.error('Error:', res.error);
      setData([]);
    } else {
      setData(res.data ?? []);
    }
  } catch (error) {
    console.error('Fetch error:', error);
    setData([]);
  }
}
```

---

## PATTERN 7: ARRAY PARAMETER IN FUNCTION CALLS

### ❌ UNSAFE
```ts
const result = buildTrades(sells, upgrades);
```

### ✅ SAFE
```ts
// Ensure parameters are arrays
const result = buildTrades(
  sells ?? [],
  upgrades ?? [],
  cashCows ?? [],
  buys ?? []
);

// OR check in function
function buildTrades(sells, upgrades, ...) {
  if (!Array.isArray(sells)) return [];
  // ...
}
```

---

## PATTERN 8: LOADING & ERROR STATES

### ❌ UNSAFE
```ts
if (loading) return <Spinner />;
return <Content data={data} />;
```

### ✅ SAFE
```ts
if (loading) return <Spinner />;
if (error) return <ErrorState />;
if (!data || data.length === 0) return <EmptyState />;
return <Content data={data} />;
```

---

## CHECKLIST FOR NEW COMPONENTS

Use this when creating Market Watch features:

- [ ] All database queries have error handling
- [ ] All `.map()` calls null-checked
- [ ] All `.slice()` calls wrapped with `??`
- [ ] All `.filter()` calls have safe input
- [ ] Function parameters allow `undefined | null`
- [ ] Early returns for invalid data
- [ ] Empty states implemented
- [ ] Loading states implemented
- [ ] Error states implemented
- [ ] Console logging for debugging
- [ ] TypeScript types allow nullability
- [ ] Array.isArray() checks where needed

---

## COMMON MISTAKES TO AVOID

1. **Assuming data exists**
   - Never access `.length` without null check
   - Never call array methods without guard

2. **Silent failures**
   - Always log errors
   - Always show user feedback

3. **Missing fallbacks**
   - Always provide default values
   - Always return empty arrays, not undefined

4. **Incomplete type definitions**
   - Allow `| undefined | null` in parameters
   - Use optional parameters where appropriate

---

**Reference:** Apply these patterns to all Market Watch components
**Updated:** 2026-03-31
