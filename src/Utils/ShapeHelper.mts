import {Point2D} from "../types.mjs";
import {Shape} from "../Shapes.mjs";

/**
 * Helper function to move a shape by a given distance
 * Creates a new shape object
 * @param shape
 * @param distance
 * @param newId if undefined, the id of the shape will be used
 */
function moveShape(shape: Shape, distance: Point2D, newId: string | undefined = undefined): Shape {
    const id = newId ?? shape.id
    switch (shape.type) {
        case 'Line':
        case "Rectangle":
            return {
                ...shape,
                id,
                from: {
                    x: shape.from.x + distance.x,
                    y: shape.from.y + distance.y
                },
                to: {
                    x: shape.to.x + distance.x,
                    y: shape.to.y + distance.y
                }
            }
        case 'Circle':
            return {
                ...shape,
                id,
                center: {
                    x: shape.center.x + distance.x,
                    y: shape.center.y + distance.y
                }
            }
        case "Triangle":
            return {
                ...shape,
                id,
                p1: {
                    x: shape.p1.x + distance.x,
                    y: shape.p1.y + distance.y
                },
                p2: {
                    x: shape.p2.x + distance.x,
                    y: shape.p2.y + distance.y
                },
                p3: {
                    x: shape.p3.x + distance.x,
                    y: shape.p3.y + distance.y
                }
            }
    }
}

export const ShapeHelper = {
    moveShape
}