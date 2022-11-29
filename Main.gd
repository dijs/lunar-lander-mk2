extends Node2D

export var max_thrust = 50
export var spin_amount = 3
export var gravity_pull = Vector2.DOWN * 5
export var fall_speed_threshold = 7
export var angl_speed_threshold = 10
export var initial_velocity = Vector2.RIGHT * 100

var rotation_input = 0 # -1, 0, 1
var velocity = Vector2.ZERO
var hit_ground = false
var spin = 0
var thrust = 0
var zoom_goal = Vector2.ONE
var fuel = 5
var result = 0

var _callback_ref = JavaScript.create_callback(self, "on_js_input")

func _ready():
	velocity = initial_velocity
	var _e = $Lander/Explosion.connect("animation_finished", self, "on_exploded")
	var dom = JavaScript.get_interface("window")
	if dom:
		dom.addEventListener('message', _callback_ref)

func on_js_input(args):
	var js_event = args[0]

	var action = JSON.parse(js_event.data).result

	if action.type == "act":
		rotation_input = action.rotate
		thrust = action.thrust * max_thrust
	
	if action.type == "status" and js_event.ports[0]:
		js_event.ports[0].postMessage(JSON.print({
			"velocity": {
				"x": velocity.x,
				"y": velocity.y
			},
			"t1": velocity.normalized().angle(),
			"angular_momentum": spin,
			"rotation": $Lander.rotation,
			"altitude": $GroundLevel.global_position.y - $Lander.global_position.y
		}))

func on_exploded():
	$Lander/Explosion.hide()

func handle_input():
	# For testing
#	if Input.is_key_pressed(KEY_LEFT):
#		rotation_input = -1
#	elif Input.is_key_pressed(KEY_RIGHT):
#		rotation_input = 1
#	else:
#		rotation_input = 0
#	if Input.is_key_pressed(KEY_SPACE) and fuel > 0:
#		thrust = max_thrust
#	else:
#		thrust = 0
	
	if Input.is_key_pressed(KEY_R):
		var _e = get_tree().reload_current_scene()

func get_thrust_direction():
	var a = $Lander.global_position
	var b = $Lander.to_global($Lander/Thrust.get_point_position(1))
	return (a - b).normalized()

func get_angular_speed(delta):
	var fps = 1 / delta
	var ang_speed = spin * delta * fps
	return abs(round(rad2deg(ang_speed)))

func _physics_process(delta):
	handle_input()
	
	if thrust > 0 and fuel <= 0:
		thrust = 0
	
	
	####
	
	var negate_vel_dir = velocity.normalized()
	$Debug.set_point_position(0, $Lander.global_position)
	$Debug.set_point_position(1, $Lander.global_position + negate_vel_dir * 32)
	
	####
	
	var thrusting = thrust > 0
	
	if thrusting:
		fuel -= delta
		if fuel <= 0:
			fuel = 0

	if hit_ground:
		if result == 1:
			$Lander.rotation = lerp($Lander.rotation, 0, 0.1)
	else:
		var alt = $GroundLevel.global_position.y - $Lander.global_position.y
		if alt < 100:
			zoom_goal = Vector2.ONE * 0.25
		else:
			zoom_goal = Vector2.ONE * 0.5
		
		$Lander/Camera2D.zoom = lerp($Lander/Camera2D.zoom, zoom_goal, 0.1)
	
		$Lander/Flames.visible = thrusting
		$Lander/Flames.playing = thrusting
	
		spin += rotation_input * delta * spin_amount
		$Lander.rotate(spin * delta)
		
		velocity += get_thrust_direction() * thrust * delta
		velocity += gravity_pull * delta
		
		var speed = round(velocity.length())
		var ang_speed = get_angular_speed(delta)
		
		$CanvasLayer/FallSpeed.text = str("Fall Speed: ", speed, " m/s")
		$CanvasLayer/AngularSpeed.text = str("Angular Speed: ", ang_speed,  " deg/s")
		$CanvasLayer/Fuel.text = str("Fuel Left: ", round(fuel * 100) / 100,  " liters")
		$CanvasLayer/Altitude.text = str("Alt: ", round($GroundLevel.global_position.y - $Lander.global_position.y))
		
		var hit = $Lander.move_and_collide(velocity * delta)
		if hit:
			hit_ground = true
			$Lander/Flames.hide()
			if speed > fall_speed_threshold or ang_speed > angl_speed_threshold:
				$Lander/Sprite.hide()
				$Lander/Thrust.hide()
				$Lander/Explosion.show()
				$Lander/Explosion.play()
				result = -1
			else:
				result = 1
