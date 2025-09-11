// Configuration and tunable constants for drip2
const CANVAS_SIZE = 800;

// Frame timing
const FRAME = 60;
const RATE = 1 / FRAME;

// Environment
const BASE_GRAVITY = 50;
const BACKGROUND_BLUE = 222;

// Blob topology and stiffness
const OBSTACLE_COUNT = 6;
const OUTER_RIM_K = 20000;
const INNER_SPOKE_K = 400;

// Mouse interaction
const MOUSE_SPRING_K = 6000;
const MOUSE_SPRING_DAMP = 100;
const MOUSE_MAX_FORCE = 20000;

// Drag neighborhood parameters
const DRAG_NEIGHBOR_RANGE = 2;
const DRAG_NEIGHBOR_DECAY = 0.6;
const DRAG_PAIR_WEIGHT = 0.5;
const DRAG_DAMP_MULTIPLIER = 2.0;

// Visualization / hub
const HUB_RADIUS = 20;

// Stabilization and material-like parameters (mutable in runtime)
let PRESSURE_K = 0.005;
let SELF_REPEL_STRENGTH = 15000;
let SELF_REPEL_RADIUS = CANVAS_SIZE / 40 * 1.6; // updated when thickness changes
let BENDING_K = 150;
let BEND_SPRING_K = 800;
let VISC_BEND_COEF = 0.35;
let REBUILD_FREEZE_FRAMES = 1; // freeze physics for a frame after vertex rebuild

// Safety clamps
let MAX_PRESSURE_FORCE = 2500;
let MAX_EXTRA_FORCE = 6000;
let CONTACT_BAND = 8;
let MAX_POINT_SPEED = 800; // px/sec cap to prevent flicker

// Obstacles
let OBSTACLE_DENSITY = 0.005;
let OBSTACLE_DAMPING = 3.5;
let CONTACT_FORCE_FACTOR = 0.25;

// Obstacle-obstacle contact (repel like weak magnets)
let OBSTACLE_CONTACT_REPEL_K_BASE = 800; // base spring-like repel strength
let OBSTACLE_CONTACT_REPEL_K = OBSTACLE_CONTACT_REPEL_K_BASE; // runtime value (scaled by UI)
let OBSTACLE_CONTACT_DAMP = 25;          // normal damping to reduce jitter
let OBSTACLE_SEPARATION_EPS = 0.5;       // small bias to keep a gap after correction (px)
let OBSTACLE_MAX_PAIR_FORCE_BASE = 4000; // base clamp per-pair force magnitude
let OBSTACLE_MAX_PAIR_FORCE = OBSTACLE_MAX_PAIR_FORCE_BASE; // runtime clamp (scaled by UI)
let OBSTACLE_CONTACT_BAND = 12;          // pixels beyond touch where repulsion acts

// Obstacle trail visualization
let OBSTACLE_TRAIL_ENABLED = true;
const OBSTACLE_TRAIL_MAX_POINTS = 300;
const OBSTACLE_TRAIL_MIN_DIST = 3; // pixels between stored points
const OBSTACLE_TRAIL_ALPHA = 90;   // 0-255
const OBSTACLE_TRAIL_POINT_SIZE = 3; // px

// Blob mass scaling
let BLOB_MASS_PER_AREA = 0.002;

// Blob splitting behavior
let ENABLE_BLOB_SPLIT_ON_PENETRATION = true;
const BLOB_SPLIT_COOLDOWN = 0.8; // seconds
const BLOB_SPLIT_SCALE = 0.5; // half size

// Force visualization
const FORCE_VIS_SCALE = 0.03;
const FORCE_VIS_MAX_LEN = 120;
const BLOB_FORCE_EMA = 0.25;
const VELOCITY_VIS_SCALE = 1.2;
const ARROW_HEAD_SIZE = 8;


