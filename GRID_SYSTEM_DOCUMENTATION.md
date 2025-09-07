# Grid System Architecture - Layer Shearing Simulation

## Overview
The simulation uses a **single computational grid system** that directly represents the physics mesh where deformation calculations occur. This provides clear visual feedback of the computational resolution and physics accuracy.

## Grid Type

### Internal Computational Grid
- **Purpose**: Shows the actual computational resolution within each material layer
- **Spacing**: Dynamic based on `gridResolution` slider (800/resolution pixels)
- **Control**: `showInternalGrid` checkbox in Simulation Controls
- **Location**: Drawn in each `Layer.draw()` method
- **Visibility**: Only within the boundaries of each layer
- **Style**: Light grey (`#333`), 0.5px line width, 60% opacity

## Code Architecture

### Grid Drawing Function
```javascript
// Internal Grid (Layer.draw method)
const showInternalGrid = document.getElementById('showInternalGrid').checked;
if (showInternalGrid) {
    // Draw resolution-dependent grid within layer boundaries
    // Vertical lines: one per grid column
    // Horizontal lines: one per grid row
}
```

### Event Listener
```javascript
// Internal grid checkbox triggers immediate redraw
document.getElementById('showInternalGrid').addEventListener('change', function() {
    updateSimulation(); // Redraw immediately when checkbox changes
});
```

## Grid Behavior

### Single Control
- **Internal Grid**: Can be shown/hidden with the checkbox
- **Clean Visualization**: No background clutter, only computational mesh
- **Immediate Response**: Checkbox triggers instant redraw

### Performance Considerations
- Grid drawing happens once per frame during `updateSimulation()`
- Internal grid is drawn per layer, but only when checkbox is checked
- No redundant grid calculations or overlapping drawing operations

### Visual Hierarchy
1. **Layer Meshes**: Bottom layer (drawn first)
2. **Internal Grids**: Middle layer (drawn second, within each layer)
3. **Boundaries & Labels**: Top layer (always visible)

## Physics Integration

### Grid Resolution Impact
- **Internal Grid**: Directly represents computational mesh density
- **Physics Accuracy**: Higher resolution = more accurate deformation simulation
- **Visual Feedback**: Internal grid shows exactly where physics calculations occur

### Boundary Conditions
- **Internal Grid**: Confined to individual layer boundaries
- **No Interference**: Grid doesn't affect physics calculations, only visualization
- **Clean Physics**: Single grid system eliminates visual confusion

## Benefits of Simplified System

### Clarity
- **Single Purpose**: One grid shows computational resolution
- **No Distraction**: Eliminates unnecessary visual elements
- **Physics Focus**: Grid directly represents where physics happens

### Performance
- **Reduced Drawing**: No background grid calculations
- **Cleaner Code**: Simpler event handling and drawing logic
- **Better FPS**: Less canvas operations per frame

## Troubleshooting

### Common Issues
1. **Grid Not Responding**: Check event listener connection
2. **Performance Issues**: Reduce grid resolution or disable internal grid
3. **Visual Clutter**: Use checkbox to show/hide internal grid

### Debug Mode
- Internal grid can be disabled for clean layer visualization
- Grid state is preserved during simulation pause/resume
- Checkbox state is maintained across page interactions
