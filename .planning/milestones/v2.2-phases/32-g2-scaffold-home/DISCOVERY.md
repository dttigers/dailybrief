# Phase 32 Discovery: Even Hub SDK

**Level:** 2 (Standard Research)
**Date:** 2026-04-04

## SDK Ecosystem

| Package | Version | Purpose |
|---------|---------|---------|
| `@evenrealities/even_hub_sdk` | 0.0.9 | Core bridge between web app and glasses |
| `@evenrealities/evenhub-cli` | 0.1.11 | CLI: `evenhub init`, `evenhub qr`, `evenhub pack` |
| `@evenrealities/evenhub-simulator` | 0.6.2 | Desktop simulator (native binaries) |

All packages very new (first published 2026-01-22, updated 2026-03-25).

## Key API

### Initialization
```typescript
import { waitForEvenAppBridge } from '@evenrealities/even_hub_sdk'
const bridge = await waitForEvenAppBridge()
```

### Core Methods
- `bridge.createStartUpPageContainer(container)` — Called **once** on first launch
- `bridge.rebuildPageContainer(container)` — All subsequent screen changes
- `bridge.textContainerUpgrade(upgrade)` — In-place text update (no flicker, max 2000 chars)
- `bridge.updateImageRawData(data)` — Push image to image container
- `bridge.shutDownPageContainer(exitMode?)` — Exit plugin

### Events
```typescript
bridge.onEvenHubEvent((event: EvenHubEvent) => {
  // event.sysEvent — FOREGROUND_ENTER, FOREGROUND_EXIT, etc.
  // event.listEvent — list item selection
  // event.textEvent — text container interaction
})
```

### Touch Events
| Gesture | Event | Typical Use |
|---------|-------|-------------|
| Swipe down | `SCROLL_BOTTOM_EVENT` (2) | Next screen |
| Swipe up | `SCROLL_TOP_EVENT` (1) | Previous screen |
| Single tap | `CLICK_EVENT` (0) | Select / Enter |
| Double tap | `DOUBLE_CLICK_EVENT` (3) | Confirm |

### Event Sources
| Source | Int | Description |
|--------|-----|-------------|
| `TOUCH_EVENT_FROM_GLASSES_R` | 1 | Right temple touchpad |
| `TOUCH_EVENT_FROM_RING` | 2 | R1 ring |
| `TOUCH_EVENT_FROM_GLASSES_L` | 3 | Left temple |

## Display Constraints

- **Canvas:** 576 x 288 pixels, origin (0,0) top-left
- **Color:** 4-bit greyscale (16 shades of green only), `borderColor` 0-15
- **No CSS/DOM/Flexbox** — absolute pixel positioning only
- **Max per page:** 12 total containers, 8 text, 4 image
- **Exactly one** container must have `isEventCapture = 1`
- **containerName:** max 16 chars
- **content:** max 1000 chars at creation, 2000 via textContainerUpgrade
- **~30-35 characters per line** at default font size
- **Text:** left-aligned, top-aligned only. No centering, no font size, no bold/italic
- Unicode block chars work: `━` dividers, `▲▽` arrows, `○●◑` status, `█▓░` progress

## Container Types

### TextContainerProperty
```typescript
{
  xPosition: number,    // 0-576
  yPosition: number,    // 0-288
  width: number,        // 0-576
  height: number,       // 0-288
  borderWidth: number,  // 0-5
  borderColor: number,  // 0-16
  borderRadius: number, // 0-10
  paddingLength: number,// 0-32
  containerID: number,
  containerName: string,
  content: string,
  isEventCapture: 0 | 1,
}
```

### ListContainerProperty
Same position/size/border props plus:
```typescript
itemContainer: {
  itemCount: number,    // 1-20
  itemName: string[],   // max 64 chars each
  itemWidth: number,    // 0 = auto fill
  isItemSelectBorderEn: 0 | 1,
}
```

## Project Setup Pattern

```bash
npm create vite@latest -- --template vanilla-ts
npm install @evenrealities/even_hub_sdk
npm install -g @evenrealities/evenhub-cli @evenrealities/evenhub-simulator
evenhub init  # creates app.json
```

## Packaging
```bash
npm run build
evenhub pack app.json dist -o plugin.ehpk
```

## Simulator
```bash
evenhub-simulator http://localhost:5173
```

## Decisions for Phase 32

1. **Project location:** `vigil-g2-plugin/` alongside `vigil-core/`
2. **Mock data first:** Home screen uses hardcoded mock data matching Vigil API response shapes
3. **Single screen:** Phase 32 = home screen only; Phase 33 adds remaining screens + navigation
