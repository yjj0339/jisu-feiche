# Blender headless: QQ飞车风格卡丁车 ×6 + 司机 + 主题道具，导出 GLB
# 坐标约定：脚本内统一「游戏坐标」(x右, y上, z车头前)，写出时转 Blender(x, -z, y)
import bpy, math, os

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'models')
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)

def C(x, y, z):
    return (x, -z, y)

def S(r, g, b):
    """sRGB 0-255 -> 线性 0-1"""
    return ((r/255)**2.2, (g/255)**2.2, (b/255)**2.2)

def mat(name, color, metallic=0.0, rough=0.5, coat=0.0, emit=None, estr=0.0, alpha=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Alpha'].default_value = alpha
    if alpha < 1.0:
        m.blend_method = 'BLEND'
    ci = bsdf.inputs.get('Coat Weight') or bsdf.inputs.get('Clearcoat')
    if ci: ci.default_value = coat
    if emit is not None:
        ei = bsdf.inputs.get('Emission Color') or bsdf.inputs.get('Emission')
        if ei: ei.default_value = (*emit, 1)
        es = bsdf.inputs.get('Emission Strength')
        if es: es.default_value = estr
    return m

def smooth_mesh(me, verts, faces):
    ns = [[0.0, 0.0, 0.0] for _ in verts]
    for f in faces:
        if len(f) < 3: continue
        a, b, c = [verts[f[i]] for i in range(3)]
        u = (b[0]-a[0], b[1]-a[1], b[2]-a[2])
        v = (c[0]-a[0], c[1]-a[1], c[2]-a[2])
        n = (u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0])
        for vi in f:
            ns[vi][0]+=n[0]; ns[vi][1]+=n[1]; ns[vi][2]+=n[2]
    flat = []
    for n in ns:
        l = math.sqrt(n[0]**2+n[1]**2+n[2]**2) or 1.0
        flat.append((n[0]/l, n[1]/l, n[2]/l))
    try:
        me.normals_split_custom_set_from_vertices(flat)
    except Exception:
        for p in me.polygons:
            p.use_smooth = True

def loft(name, sections, matl, radial=22, top_exp=0.9, bot_sq=0.45, parent=None):
    verts, faces = [], []
    n = len(sections)
    for (z, w, yb, yt) in sections:
        ym = (yt+yb)/2; ry = (yt-yb)/2
        for k in range(radial):
            th = k/radial*math.tau
            c, s = math.cos(th), math.sin(th)
            px = w * (1 if c >= 0 else -1) * abs(c)**0.72
            py = ym + ry*(s**top_exp if s >= 0 else bot_sq*s)
            verts.append(C(px, py, z))
    for i in range(n-1):
        for k in range(radial):
            a = i*radial+k; b = i*radial+(k+1) % radial
            c2 = (i+1)*radial+k; d = (i+1)*radial+(k+1) % radial
            faces.append((a, c2, b)); faces.append((b, c2, d))
    for ring, flip in ((0, True), (n-1, False)):
        z = sections[ring][0]
        yb, yt = sections[ring][2], sections[ring][3]
        ci = len(verts)
        verts.append(C(0, (yt+yb)/2, z))
        for k in range(radial):
            a = ring*radial+k; b = ring*radial+(k+1) % radial
            faces.append((ci, b, a) if flip else (ci, a, b))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces); me.update()
    smooth_mesh(me, verts, faces)
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(matl)
    if parent: obj.parent = parent
    return obj

def rot_bl(rot):
    return (rot[0], -rot[2], rot[1])

def box(name, dims, loc, matl, rot=(0,0,0), bevel=0.02, parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=C(*loc), rotation=rot_bl(rot))
    o = bpy.context.active_object
    o.name = name
    o.scale = (dims[0], dims[2], dims[1])   # 游戏 (x宽,y高,z长) -> blender (x, z, y)
    bpy.ops.object.transform_apply(scale=True)
    if bevel > 0:
        be = o.modifiers.new('bev', 'BEVEL'); be.width = bevel; be.segments = 2
        bpy.context.view_layer.objects.active = o
        try: bpy.ops.object.modifier_apply(modifier='bev')
        except Exception: pass
    o.data.materials.append(matl)
    if parent: o.parent = parent
    return o

def cyl(name, r, depth, loc, matl, axis='x', parent=None, verts=16, rot_extra=(0,0,0)):
    rot = (0, math.pi/2, 0) if axis == 'x' else (math.pi/2, 0, 0) if axis == 'z' else (0,0,0)
    rot = (rot[0]+rot_extra[0], rot[1]+rot_extra[1], rot[2]+rot_extra[2])
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=C(*loc), rotation=rot)
    o = bpy.context.active_object; o.name = name
    o.data.materials.append(matl)
    if parent: o.parent = parent
    return o

def cone(name, r, depth, loc, matl, parent=None, verts=16, rot=(0,0,0)):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=0.0, depth=depth,
                                    location=C(*loc), rotation=rot_bl(rot))
    o = bpy.context.active_object; o.name = name
    o.data.materials.append(matl)
    if parent: o.parent = parent
    return o

def sph(name, r, loc, matl, scale=(1,1,1), parent=None, seg=20):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=int(seg*0.7), radius=r, location=C(*loc))
    o = bpy.context.active_object; o.name = name
    o.scale = scale   # 游戏 x,y,z —— 球各向同性，无需转轴
    bpy.ops.object.transform_apply(scale=True)
    o.data.materials.append(matl)
    if parent: o.parent = parent
    return o

def torus(name, major, minor, loc, matl, parent=None, rot=(0,0,0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor,
        major_segments=24, minor_segments=10, location=C(*loc), rotation=rot_bl(rot))
    o = bpy.context.active_object; o.name = name
    o.data.materials.append(matl)
    if parent: o.parent = parent
    return o

def empty(name, loc, parent=None):
    o = bpy.data.objects.new(name, None)
    o.location = C(*loc)
    bpy.context.collection.objects.link(o)
    if parent: o.parent = parent
    return o

# ============================================================
#  卡丁车（QQ飞车风：圆润卡通 + 可见司机 + 后置排气）
# ============================================================
def build_kart(idx, cfg):
    paint  = mat('K%dPaint'%idx,  S(*cfg['paint']),  metallic=0.12, rough=0.30, coat=0.8)
    accent = mat('K%dAcc'%idx,    S(*cfg['accent']), rough=0.45)
    tire   = mat('K%dTire'%idx,   S(30, 30, 32),     rough=0.95)
    rim    = mat('K%dRim'%idx,    S(*cfg['rim']),    metallic=0.9, rough=0.22)
    chrome = mat('K%dChrome'%idx, S(225, 230, 236),  metallic=1.0, rough=0.15)
    glass  = mat('K%dGlass'%idx,  S(28, 40, 55),     rough=0.08)
    helmet = mat('K%dHelmet'%idx, S(*cfg['helmet']), rough=0.25, coat=0.7)
    head   = mat('K%dHead'%idx,   S(14,16,20),       rough=0.2, emit=S(255,241,180), estr=5)
    tail   = mat('K%dTail'%idx,   S(60, 8, 8),       rough=0.2, emit=S(255, 60, 40), estr=4)
    seat   = mat('K%dSeat'%idx,   S(52, 44, 40),     rough=0.8)

    root = empty('Kart', (0,0,0))

    body = loft('Body', [
        ( 1.02, 0.30, 0.14, 0.34),
        ( 0.82, 0.44, 0.11, 0.48),
        ( 0.48, 0.50, 0.09, 0.58),
        ( 0.10, 0.52, 0.09, 0.62),
        (-0.38, 0.56, 0.09, 0.66),
        (-0.78, 0.56, 0.11, 0.64),
        (-1.00, 0.46, 0.15, 0.58),
    ], paint, radial=24, parent=root)

    # 车头保险杠 + 大灯
    box('Bumper', (0.62, 0.16, 0.14), (0, 0.26, 1.02), accent, bevel=0.03, parent=root)
    sph('LampL', 0.075, ( 0.20, 0.40, 0.98), head, parent=root)
    sph('LampR', 0.075, (-0.20, 0.40, 0.98), head, parent=root)
    box('TailBar', (0.78, 0.07, 0.06), (0, 0.50, -1.00), tail, parent=root)

    # 侧裙
    for sx in (1, -1):
        box('Skirt', (0.10, 0.10, 1.15), (sx*0.55, 0.15, 0.0), accent, parent=root)

    # 座舱 + 司机
    box('SeatBack', (0.46, 0.30, 0.12), (0, 0.74, -0.52), seat, bevel=0.03, parent=root)
    box('SeatBase', (0.42, 0.10, 0.34), (0, 0.60, -0.34), seat, parent=root)
    sph('Torso', 0.19, (0, 0.80, -0.38), seat, scale=(1, 1.05, 0.9), parent=root)
    hd = sph('Head', 0.235, (0, 1.02, -0.36), helmet, parent=root)
    box('Visor', (0.30, 0.11, 0.16), (0, 1.04, -0.16), glass, rot=(0.18,0,0), bevel=0.02, parent=root)
    sph('ShL', 0.09, ( 0.21, 0.86, -0.34), helmet, parent=root)
    sph('ShR', 0.09, (-0.21, 0.86, -0.34), helmet, parent=root)
    torus('WheelSteer', 0.10, 0.028, (0, 0.80, 0.16), chrome, rot=(0.5,0,0), parent=root)

    # 排气 + 火焰锚点
    for sx in (1, -1):
        cyl('Exh%d'%sx, 0.055, 0.24, (sx*0.20, 0.40, -1.02), chrome, axis='z', rot_extra=(0.35,0,0), parent=root)
        empty('Flame%d'%sx, (sx*0.20, 0.50, -1.22), root)

    # 尾翼
    if cfg.get('spoiler'):
        for sx in (1, -1):
            box('SpoStrut', (0.05, 0.26, 0.06), (sx*0.32, 0.76, -0.86), accent, parent=root)
        box('SpoWing', (0.98, 0.06, 0.30), (0, 0.92, -0.90), paint, bevel=0.02, parent=root)
        box('SpoTop',  (0.98, 0.04, 0.10), (0, 0.97, -1.00), accent, parent=root)

    # 车轮：pivot(转向) -> spin(滚动)
    def wheel(tag, x, z, r, wdt):
        piv = empty('Wheel'+tag, (x, r, z), root)
        spin = empty('Spin'+tag, (0,0,0), piv)
        cyl('Tire'+tag, r, wdt, (0,0,0), tire, axis='x', parent=spin, verts=18)
        cyl('Hub'+tag, r*0.55, wdt+0.03, (0,0,0), rim, axis='x', parent=spin, verts=14)
        sph('Cap'+tag, r*0.22, (0,0,0), accent, scale=(0.4,1,1), parent=spin)
        return piv

    fw_r, rw_r = cfg.get('fw', 0.245), cfg.get('rw', 0.30)
    wheel('FL',  0.62, 0.60, fw_r, 0.20)
    wheel('FR', -0.62, 0.60, fw_r, 0.20)
    wheel('RL',  0.63, -0.60, rw_r, 0.26)
    wheel('RR', -0.63, -0.60, rw_r, 0.26)

    # 后轮叶子板
    for sx in (1, -1):
        sph('Fender', rw_r+0.09, (sx*0.63, rw_r+0.02, -0.60), accent, scale=(0.55, 0.5, 1.0), parent=root)
    return root

KARTS = [
    dict(paint=(255,122,0),  accent=(255,244,214), rim=(255,214,120), helmet=(255,255,255), spoiler=False),
    dict(paint=(30,127,255), accent=(255,255,255), rim=(255,214,40),  helmet=(240,248,255), spoiler=True),
    dict(paint=(255,111,165),accent=(255,240,248), rim=(255,255,255), helmet=(255,224,140), spoiler=False),
    dict(paint=(53,194,78),  accent=(245,255,240), rim=(180,255,180), helmet=(40,80,40),    spoiler=False),
    dict(paint=(255,196,0),  accent=(60,60,70),    rim=(60,60,70),    helmet=(50,50,60),    spoiler=True),
    dict(paint=(139,92,246), accent=(245,240,255), rim=(255,200,80),  helmet=(30,30,45),    spoiler=True),
]

# ============================================================
#  主题道具
# ============================================================
def build_palm():
    root = empty('Palm', (0,0,0))
    trunk = mat('Trunk', S(160,120,80), rough=0.9)
    leaf  = mat('Leaf',  S(60,190,90), rough=0.7)
    nut   = mat('Nut',   S(120,90,60), rough=0.8)
    y = 0
    for i in range(5):
        r = 0.24 - i * 0.022
        tilt = (0, 0, i * 0.05)
        c = cyl('Tr%d'%i, r, 0.95, (i*0.16, y+0.44, 0), trunk, axis='z', rot_extra=tilt, parent=root)
        y += 0.62
    top = (5*0.16, y+0.30, 0)
    for k in range(7):
        ang = k/7*math.tau
        L = sph('Leaf%d'%k, 1.0, (top[0]+math.sin(ang)*0.55, top[1]-0.10, top[2]+math.cos(ang)*0.55),
                leaf, scale=(0.30, 0.05, 0.85), parent=root)
    sph('Nut1', 0.16, (top[0], top[1]-0.18, top[2]+0.2), nut, parent=root)
    sph('Nut2', 0.14, (top[0]+0.2, top[1]-0.18, top[2]-0.1), nut, parent=root)
    return root

def build_sakura():
    root = empty('Sakura', (0,0,0))
    trunk = mat('STrunk', S(110,80,70), rough=0.9)
    p1 = mat('P1', S(255,183,213), rough=0.6)
    p2 = mat('P2', S(255,158,199), rough=0.6)
    p3 = mat('P3', S(255,205,225), rough=0.6)
    cyl('Tr', 0.16, 1.5, (0, 0.75, 0), trunk, axis='z', parent=root)
    cyl('Tr2', 0.11, 0.9, (0.18, 1.55, 0.05), trunk, axis='z', rot_extra=(0.12,0,0), parent=root)
    sph('C1', 0.95, (0.15, 2.25, 0), p1, parent=root)
    sph('C2', 0.70, (0.85, 2.05, 0.35), p2, parent=root)
    sph('C3', 0.65, (-0.55, 2.10, -0.30), p2, parent=root)
    sph('C4', 0.55, (0.10, 2.80, 0.10), p3, parent=root)
    return root

def build_snowtree():
    root = empty('SnowTree', (0,0,0))
    trunk = mat('WTrunk', S(120,95,75), rough=0.9)
    frost = mat('Frost', S(120,180,150), rough=0.8)
    snow  = mat('Snow',  S(245,250,255), rough=0.6)
    cyl('Tr', 0.14, 0.8, (0, 0.4, 0), trunk, axis='z', parent=root)
    cone('L1', 1.05, 1.4, (0, 1.35, 0), frost, parent=root)
    cone('S1', 0.72, 0.7, (0, 1.75, 0), snow, parent=root)
    cone('L2', 0.78, 1.2, (0, 2.15, 0), frost, parent=root)
    cone('S2', 0.5, 0.6, (0, 2.5, 0), snow, parent=root)
    cone('L3', 0.5, 0.9, (0, 2.9, 0), frost, parent=root)
    sph('Cap', 0.2, (0, 3.35, 0), snow, parent=root)
    return root

def build_arch():
    root = empty('Arch', (0,0,0))
    red   = mat('ArchRed',   S(236,72,60), rough=0.4)
    white = mat('ArchWhite', S(250,250,250), rough=0.4)
    black = mat('Chk', S(40,40,44), rough=0.35)
    chk   = mat('ChkW', S(250,250,250), rough=0.35, emit=S(120,120,120), estr=0.5)
    flag = [mat('F1', S(255,200,60)), mat('F2', S(80,180,255)), mat('F3', S(255,120,160)), mat('F4', S(90,210,120))]
    for sx in (1, -1):
        box('Pillar', (0.8, 5.2, 0.8), (sx*8.0, 2.6, 0), red, bevel=0.05, parent=root)
        box('PStripe1', (0.84, 0.5, 0.84), (sx*8.0, 1.2, 0), white, bevel=0.02, parent=root)
        box('PStripe2', (0.84, 0.5, 0.84), (sx*8.0, 3.6, 0), white, bevel=0.02, parent=root)
        sph('PTop', 0.55, (sx*8.0, 5.35, 0), white, parent=root)
    box('Beam', (17.0, 1.1, 0.9), (0, 5.6, 0), red, bevel=0.04, parent=root)
    # 格纹带（前后两面）
    for face_z in (0.47, -0.47):
        n = 24
        for i in range(n):
            x = -8.0 + (i+0.5)*(16.0/n)
            m = chk if i % 2 == 0 else black
            box('Chk%s_%d'%(face_z,i), (16.0/n, 0.55, 0.04), (x, 5.6, face_z), m, bevel=0, parent=root)
    # 彩旗
    for i in range(10):
        x = -7.2 + i*1.6
        cone('Flag%d'%i, 0.28, 0.7, (x, 4.9, 0), flag[i % 4], rot=(math.pi, 0, 0), verts=4, parent=root)
    return root

def build_boostpad():
    root = empty('BoostPad', (0,0,0))
    base = mat('PadBase', S(255,170,30), rough=0.4)
    arr  = mat('PadArrow', S(255,235,120), rough=0.3, emit=S(255,220,80), estr=2.5)
    box('Base', (3.4, 0.10, 5.2), (0, 0.05, 0), base, bevel=0.03, parent=root)
    for k, z in enumerate((1.3, -0.2, -1.7)):
        for sx in (1, -1):
            b = box('Arr%d%s'%(k,sx), (0.62, 0.10, 1.5), (sx*0.62, 0.13, z), arr, bevel=0.01, parent=root)
            b.rotation_euler = (0, sx*0.55, 0)
    return root

def build_itembox():
    root = empty('ItemBox', (0,0,0))
    candy = mat('Candy', S(90,200,255), rough=0.15, coat=0.9, emit=S(30,90,140), estr=0.8)
    glow  = mat('Glow', S(255,220,90), rough=0.2, emit=S(255,210,80), estr=4)
    edge  = mat('Edge', S(255,255,255), rough=0.3)
    lo = loft('Shell', [
        (-0.55, 0.55, -0.55, 0.55),
        (-0.30, 0.60, -0.62, 0.62),
        ( 0.30, 0.60, -0.62, 0.62),
        ( 0.55, 0.55, -0.55, 0.55),
    ], candy, radial=20, parent=root)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=0.42, location=C(0,0,0))
    o = bpy.context.active_object; o.name = 'Core'
    o.data.materials.append(glow); o.parent = root
    return root

def build_missile():
    root = empty('Missile', (0,0,0))
    red   = mat('MRed', S(235,60,50), rough=0.3)
    white = mat('MWhite', S(245,245,245), rough=0.3)
    fire  = mat('MFire', S(255,180,60), rough=0.2, emit=S(255,160,40), estr=5)
    cyl('Body', 0.16, 0.9, (0, 0, 0.1), white, axis='z', parent=root)
    cone('Nose', 0.16, 0.42, (0, 0, 0.76), red, parent=root)
    for k in range(3):
        ang = k/3*math.tau
        x, y = math.sin(ang)*0.17, math.cos(ang)*0.17
        b = box('Fin%d'%k, (0.04, 0.22, 0.26), (x, y, -0.32), red, parent=root)
    cyl('Jet', 0.09, 0.24, (0, 0, -0.48), fire, axis='z', parent=root)
    return root

def build_candytree():
    root = empty('CandyTree', (0,0,0))
    stick = mat('Stick', S(250,248,244), rough=0.35)
    ball = mat('Ball', S(255,111,176), rough=0.3, coat=0.7)
    band1 = mat('Band1', S(126,231,199), rough=0.3)
    band2 = mat('Band2', S(255,214,74), rough=0.3)
    band3 = mat('Band3', S(124,181,255), rough=0.3)
    cyl('Stick', 0.09, 1.9, (0, 0.95, 0), stick, axis='z', parent=root)
    sph('Ball', 0.85, (0, 2.5, 0), ball, parent=root)
    for k, (m, y, r) in enumerate([(band1, 2.85, 0.50), (band2, 2.5, 0.72), (band3, 2.15, 0.50)]):
        t = torus('Band%d'%k, r, 0.14, (0, y, 0), m, rot=(0, k*0.5, 0), parent=root)
    return root

def build_signpost():
    root = empty('Sign', (0,0,0))
    pole = mat('Pole', S(200,205,210), metallic=0.8, rough=0.3)
    board= mat('Board', S(255,248,220), rough=0.5)
    txt  = mat('Txt', S(250,80,60), rough=0.4)
    cyl('Pole', 0.06, 2.2, (0, 1.1, 0), pole, axis='z', parent=root)
    box('Board', (1.5, 0.8, 0.08), (0, 2.0, 0), board, bevel=0.03, parent=root)
    box('Bar1', (1.1, 0.12, 0.03), (0, 2.15, 0.06), txt, bevel=0, parent=root)
    box('Bar2', (0.8, 0.12, 0.03), (0, 1.9, 0.06), txt, bevel=0, parent=root)
    return root

# ============================================================
#  导出
# ============================================================
def export_sel(rootlist, path):
    bpy.ops.object.select_all(action='DESELECT')
    def sel(o):
        o.select_set(True)
        for ch in o.children: sel(ch)
    for r in rootlist: sel(r)
    kw = dict(filepath=path, export_format='GLB', export_apply=True,
              export_yup=True, export_animations=False, export_skins=False,
              export_morph=False, export_cameras=False, export_lights=False)
    try:
        bpy.ops.export_scene.gltf(use_selection=True, **kw)
    except TypeError:
        bpy.ops.export_scene.gltf(**kw)
    print('EXPORTED', path)

def fresh():
    bpy.ops.wm.read_factory_settings(use_empty=True)

for i, cfg in enumerate(KARTS):
    r = build_kart(i, cfg)
    export_sel([r], os.path.join(OUT, 'kart%d.glb' % i))
    fresh()

for name, fn in [('palm', build_palm), ('sakura', build_sakura), ('snowtree', build_snowtree),
                 ('candytree', build_candytree),
                 ('arch', build_arch), ('boostpad', build_boostpad),
                 ('itembox', build_itembox), ('missile', build_missile), ('sign', build_signpost)]:
    r = fn()
    export_sel([r], os.path.join(OUT, '%s.glb' % name))
    fresh()

print('DONE')
