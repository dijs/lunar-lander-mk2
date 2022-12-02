extends Node2D

const Lander = preload("res://Lander.tscn")

var _callback_ref = JavaScript.create_callback(self, "on_js_input")

func _ready():
	var dom = JavaScript.get_interface("window")
	if dom:
		dom.addEventListener('message', _callback_ref)

func get_lander(id):
	for e in get_tree().get_nodes_in_group("lander"):
		if e.id == id:
			return e
	return null

func on_js_input(args):
	var js_event = args[0]
	var action = JSON.parse(js_event.data).result

	if action.type == "create":
		var e = Lander.instance()
		e.id = action.id
		e.position = Vector2(action.x, action.y)
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
