#![allow(non_snake_case)] // Canvas Appliaction uses CamelCase

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::userstore::UserId;

use super::store::AccessLevel;

#[derive(Serialize, Deserialize, Debug)]
pub struct Point2D {
    pub x: i32, // We will never use sub-pixel precision, but technically js uses floats
    pub y: i32, // We will never use sub-pixel precision
}

#[derive(Serialize, Deserialize, Debug)]
#[serde(tag = "type")]
pub enum Shape {
    Line {
        id: String,
        temporary: bool,
        borderColor: String,
        fillColor: String,

        from: Point2D,
        to: Point2D
    },
    Circle {
        id: String,
        temporary: bool,
        borderColor: String,
        fillColor: String,

        center: Point2D,
        radius: f32
    },
    Rectangle {
        id: String,
        temporary: bool,
        borderColor: String,
        fillColor: String,

        from: Point2D,
        to: Point2D
    },
    Triangle {
        id: String,
        temporary: bool,
        borderColor: String,
        fillColor: String,

        p1: Point2D,
        p2: Point2D,
        p3: Point2D
    }
} 

impl Shape {
    pub fn get_id(&self) -> &str {
        match self {
            Shape::Line { id, .. } => id,
            Shape::Circle { id, .. } => id,
            Shape::Rectangle { id, .. } => id,
            Shape::Triangle { id, .. } => id,
        }
    }

    pub fn is_temporary(&self) -> bool {
        match self {
            Shape::Line { temporary, .. } => *temporary,
            Shape::Circle { temporary, .. } => *temporary,
            Shape::Rectangle { temporary, .. } => *temporary,
            Shape::Triangle { temporary, .. } => *temporary,
        }
    }
}

#[derive(Serialize, Deserialize, Debug)]
#[allow(clippy::enum_variant_names)] // Canvas Application uses this naming 
#[serde(tag = "type")]
pub enum CanvasEvents {
    ShapeAdded {
        origin: String,
        timestamp: u64,
        shape: Shape,
    },
    ShapeRemoved {
        origin: String,
        timestamp: u64,
        shapeId: String,
    },
    ShapeSelected {
        origin: String,
        timestamp: u64,
        shapeId: String,
        options: Value,
    },
    ShapeDeselected {
        origin: String,
        timestamp: u64,
        shapeId: String,
    },
    ShapeZChanged {
        origin: String,
        timestamp: u64,
        shapeId: String,
        z: Value, // NOTE: Uses custom serializer in Canvas Appliaction
    },
    ShapeUpdated {
        origin: String,
        timestamp: u64,
        shape: Value,
    },
    UserJoined {
        timestamp: u64,
        userId: String,
        username: String,
        accessLevel: AccessLevel
    },
    UserLeft {
        timestamp: u64,
        userId: String
    },
    UserAccessLevelChanged {
        timestamp: u64,
        userId: String,
        accessLevel: AccessLevel
    },
    CanvasStateChanged {
        timestamp: u64,
        state: Value,
        initiator: UserId
    },
}
