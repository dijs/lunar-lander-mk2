extends Node2D

export var max_thrust = 50
export var spin_amount = 3
export var gravity_pull = Vector2.DOWN * 5
export var fall_speed_threshold = 3
export var angl_speed_threshold = 10

var rotation_input = 0 # -1, 0, 1
var velocity = Vector2.RIGHT * 40
var hit_ground = false
var spin = 0
var thrust = 0
var zoom_goal = Vector2.ONE
var fuel = 5
var result = 0

func _ready():
	var _e = $Lander/Explosion.connect("animation_finished", self, "on_exploded")

func on_exploded():
	$Lander/Explosion.hide()

func handle_input():
	# For testing
	if Input.is_key_pressed(KEY_LEFT):
		rotation_input = -1
	elif Input.is_key_pressed(KEY_RIGHT):
		rotation_input = 1
	else:
		rotation_input = 0
	if Input.is_key_pressed(KEY_SPACE) and fuel > 0:
		thrust = max_thrust
	else:
		thrust = 0
	
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
	
	var thrusting = thrust > 0
	$Lander/Flames.visible = thrusting
	$Lander/Flames.playing = thrusting
	
	if thrusting:
		fuel -= delta
		if fuel <= 0:
			fuel = 0
	
	if hit_ground:
		if result == 1:
			$Lander.rotation = lerp($Lander.rotation, 0, 0.1)
	else:
		if $Lander/RayCast2D.is_colliding():
			zoom_goal = Vector2.ONE * 0.25
		else:
			zoom_goal = Vector2.ONE * 0.5
		
		$Lander/Camera2D.zoom = lerp($Lander/Camera2D.zoom, zoom_goal, 0.1)
	
		spin += rotation_input * delta * spin_amount
		$Lander.rotate(spin * delta)
		
		velocity += get_thrust_direction() * thrust * delta
		velocity += gravity_pull * delta
		
		var speed = round(velocity.length())
		var ang_speed = get_angular_speed(delta)
		
		$CanvasLayer/FallSpeed.text = str("Fall Speed: ", speed, " m/s")
		$CanvasLayer/AngularSpeed.text = str("Angular Speed: ", ang_speed,  " deg/s")
		$CanvasLayer/Fuel.text = str("Fuel Left: ", round(fuel * 100) / 100,  " liters")
		
		var hit = $Lander.move_and_collide(velocity * delta)
		if hit:
			hit_ground = true
			if speed > fall_speed_threshold or ang_speed > angl_speed_threshold:
				$Lander/Sprite.hide()
				$Lander/Thrust.hide()
				$Lander/Explosion.show()
				$Lander/Explosion.play()
				result = -1
			else:
				result = 1
