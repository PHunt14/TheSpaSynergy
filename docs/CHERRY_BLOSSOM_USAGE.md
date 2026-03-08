# Cherry Blossom Component Usage Guide

## Component Location
`app/components/CherryBlossom.jsx`

## Basic Usage

```jsx
import CherryBlossom from './components/CherryBlossom';

<CherryBlossom />
```

## Styling Options

### 1. Corner Decoration (Subtle Background)
```jsx
<div style={{ position: 'relative' }}>
  <CherryBlossom className="blossom-corner-top-right" />
  {/* Your content */}
</div>
```

### 2. Section Divider
```jsx
<CherryBlossom className="blossom-divider" />
```

### 3. Header Accent
```jsx
<CherryBlossom className="blossom-header-accent" />
<h2>Your Heading</h2>
```

### 4. Custom Inline Styles
```jsx
<CherryBlossom 
  style={{ 
    width: '300px', 
    opacity: 0.2,
    transform: 'rotate(15deg)'
  }} 
/>
```

## Pre-defined CSS Classes

- `blossom-corner-top-right` - Subtle corner decoration (top right)
- `blossom-corner-bottom-left` - Subtle corner decoration (bottom left, mirrored)
- `blossom-divider` - Section divider (centered, 200px)
- `blossom-header-accent` - Above headings (centered, 150px)

## Color Integration

The branch color automatically uses `var(--color-primary-dark)` from your theme, so it matches your site's color scheme.

## Examples in Use

### Hero Section Background
```jsx
<section className="hero" style={{ position: 'relative', overflow: 'hidden' }}>
  <CherryBlossom 
    style={{ 
      position: 'absolute', 
      top: '-20px', 
      right: '-40px', 
      opacity: 0.15, 
      width: '400px',
      pointerEvents: 'none'
    }} 
  />
  <h1>Welcome</h1>
</section>
```

### Between Sections
```jsx
<section>Content 1</section>
<CherryBlossom className="blossom-divider" />
<section>Content 2</section>
```

### Card Decoration
```jsx
<div style={{ position: 'relative', padding: '2rem', background: 'white' }}>
  <CherryBlossom 
    style={{ 
      position: 'absolute', 
      top: 0, 
      right: 0, 
      width: '150px', 
      opacity: 0.1 
    }} 
  />
  <h3>Card Title</h3>
  <p>Card content...</p>
</div>
```

## Tips

- Use low opacity (0.1-0.3) for subtle backgrounds
- Use `pointerEvents: 'none'` for decorative overlays
- Mirror with `transform: scaleX(-1)` for variety
- Adjust size with `width` property (maintains aspect ratio)
- Position absolutely for overlays, relatively for flow elements
