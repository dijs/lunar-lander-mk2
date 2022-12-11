extends Node2D

const Lander = preload("res://Lander.tscn")

var _callback_ref = JavaScript.create_callback(self, "on_js_input")

var player_lander = null

func _ready():
	var dom = JavaScript.get_interface("window")
	if dom:
		dom.addEventListener('message', _callback_ref)

func get_lander(id):
	for e in get_tree().get_nodes_in_group("lander"):
		if e.id == id:
			return e
	return null

func on_player_lander_removed():
	player_lander = null

func _input(event):
	if player_lander == null and Input.is_action_just_pressed("start_manual"):
		player_lander = Lander.instance()
		player_lander.position = Vector2(-200, -200)
		player_lander.initial_rotation = -PI/2
		player_lander.initial_velocity = Vector2(100, 0)
		player_lander.get_node("TimeoutTimer").stop()
		player_lander.connect("removed", self, "on_player_lander_removed")
		add_child(player_lander)
	if player_lander != null:
		var nothing = true
		if Input.is_action_pressed("rotate_left"):
			player_lander.rotation_input = -1
			nothing = false
		if Input.is_action_pressed("rotate_right"):
			player_lander.rotation_input = 1
			nothing = false
		if Input.is_action_pressed("fire_thruster"):
			player_lander.thrust = player_lander.max_thrust
			nothing = false
		if nothing:
			player_lander.rotation_input = 0
			player_lander.thrust = 0

func on_js_input(args):
	var js_event = args[0]
	var action = JSON.parse(js_event.data).result

	if action.type == "debug":
		var count = get_tree().get_nodes_in_group("lander")
		js_event.ports[0].postMessage(count.size())

	if action.type == "create":
		var e = Lander.instance()
		e.id = action.id
		e.position = Vector2(action.x, action.y)
		e.initial_velocity = Vector2(action.vx, action.vy)
		e.initial_rotation = action.rot
		e.is_bot = true
		add_child(e)

	if action.type == "reset":
		var e = get_lander(action.id)
		if e:
			e.initial_velocity = Vector2.RIGHT * action.initial_velocity
			e.initial_rotation = action.initial_rotation
			e.gravity_pull = Vector2.DOWN * action.gravity_amount
			e.initial_spin = action.initial_spin
			e.reset()

	if action.type == "act":
		var e = get_lander(action.id)
		if e:
			e.rotation_input = action.rotate
			e.thrust = action.thrust * e.max_thrust
	
	if action.type == "status" and js_event.ports[0]:
		var e = get_lander(action.id)
		if e:
			js_event.ports[0].postMessage(JSON.print(e.get_status()))
