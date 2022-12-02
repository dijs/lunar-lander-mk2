extends KinematicBody2D

# Presets which determine different scenarios
export var initial_velocity = Vector2.RIGHT * 100
export var initial_rotation = -PI / 2
export var gravity_pull = Vector2.DOWN * 5
export var initial_spin = 0
export var initial_fuel = 20

export var max_thrust = 50
export var spin_amount = 3
export var fall_speed_threshold = 8
export var angl_speed_threshold = 10

const LANDED = 1
const CRASHED = -1
const ground_level = 114

var rotation_input = 0 # -1, 0, 1
var velocity = Vector2.ZERO
var hit_ground = false
var spin = 0
var thrust = 0
var zoom_goal = Vector2.ONE
var fuel = 0
var result = 0
var id = '0'

var _callback_ref = JavaScript.create_callback(self, "on_js_input")

func _ready():
	reset()
	var _e = $Explosion.connect("animation_finished", self, "on_exploded")
	_e = $RemoveTimer.connect("timeout", self, "queue_free")

func get_status():
	return {
		"id": id,
		"velocity": {
			"x": velocity.x,
			"y": velocity.y
		},
		"x_err": abs(global_position.x),
		"angular_momentum": spin,
		"rotation": rotation + PI / 2,
		"altitude": ground_level - global_position.y,
		"landed": result
	}

func reset():
	velocity = initial_velocity
	fuel = initial_fuel
	result = 0
	hit_ground = false
	spin = initial_spin
	rotation = initial_rotation
	$Sprite.show()

func on_exploded():
	$Explosion.hide()
	$RemoveTimer.start()

func get_thrust_direction():
	var a = global_position
	var b = to_global($Thrust.get_point_position(1))
	return (a - b).normalized()

func get_angular_speed(delta):
	var fps = 1 / delta
	var ang_speed = spin * delta * fps
	return abs(round(rad2deg(ang_speed)))

func _physics_process(delta):
	if thrust > 0 and fuel <= 0:
		thrust = 0
	
	var thrusting = thrust > 0
	
	if thrusting:
		fuel -= delta
		if fuel <= 0:
			fuel = 0

	if hit_ground:
		if result == LANDED:
			rotation = lerp(rotation, 0, 0.1)
	else:
		$Flames.visible = thrusting
		$Flames.playing = thrusting
	
		spin += rotation_input * delta * spin_amount
		rotate(spin * delta)
		
		velocity += get_thrust_direction() * thrust * delta
		velocity += gravity_pull * delta
		
		var speed = round(velocity.length())
		var ang_speed = get_angular_speed(delta)
		
		var hit = move_and_collide(velocity * delta)
		if hit:
			hit_ground = true
			$Flames.hide()
			if speed > fall_speed_threshold or ang_speed > angl_speed_threshold:
				$Sprite.hide()
				$Thrust.hide()
				$Explosion.show()
				$Explosion.frame = 0
				$Explosion.play()
				result = CRASHED
			else:
				result = LANDED
		
		# Check if it fell outside of bounds
		if position.y > 200:
			result = CRASHED
			$RemoveTimer.start()
