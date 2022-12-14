extends KinematicBody2D

signal removed

# Presets which determine different scenarios
export var initial_velocity = Vector2.ZERO
export var initial_rotation = 0 # -PI / 2
export var gravity_pull = Vector2.DOWN * 5
export var initial_spin = 0
export var initial_fuel = 10

export var max_thrust = 50
export var spin_amount = 3
export var fall_speed_threshold = 10
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
var is_bot = false

var _callback_ref = JavaScript.create_callback(self, "on_js_input")

func _ready():
	reset()
	var _e = $Explosion.connect("animation_finished", self, "on_exploded")
	_e = $RemoveTimer.connect("timeout", self, "queue_free")
	_e = $TimeoutTimer.connect("timeout", self, "on_out")
	if is_bot:
		$TimeoutTimer.start()

func on_out():
	if result == 0:
		global_position.x = 10000
		result = CRASHED
		$RemoveTimer.start()

func dist_to_ray(ray: RayCast2D):
	if ray.is_colliding():
		return position.distance_to(ray.get_collision_point())
	else:
		return 2048

func get_rays():
	return {
		"n": dist_to_ray($Rays/N),
		"ne": dist_to_ray($Rays/NE),
		"e": dist_to_ray($Rays/E),
		"se": dist_to_ray($Rays/SE),
		"s": dist_to_ray($Rays/S),
		"sw": dist_to_ray($Rays/SW),
		"w": dist_to_ray($Rays/W),
		"nw": dist_to_ray($Rays/NW),
	}

func get_status():
	return {
		"id": id,
		"velocity": {
			"x": velocity.x,
			"y": velocity.y
		},
		"ux": velocity.normalized().x,
		"uy": velocity.normalized().y,
		"rays": get_rays(),
		"x": global_position.x / 500.0,
		"y": (global_position.y - 114.0) / (-414.0),
		"r": (rotation + PI) / PI / 2,
		"angular_momentum": spin,
		"fuel": fuel,
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
	
#	var s = get_status()
#	$Debug.text = str("UX: ", s["ux"], "\nUY: ", s["uy"], "\nX: ", s["x"], "\nY: ", s["y"], "\nR: ", s["r"])
	
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
				emit_signal("removed")
			else:
				result = LANDED
				emit_signal("removed")
				if is_bot:
					$RemoveTimer.start()
		
		# Check if it fell outside of bounds
		if position.y > 200:
			result = CRASHED
			$RemoveTimer.start()
