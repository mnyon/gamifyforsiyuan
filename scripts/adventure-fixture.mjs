// Fictional account and a minimal official-content snapshot for offline UI checks.
// Artwork/text attribution: THIRD-PARTY-NOTICES.md. Never reads credentials.
export const adventureContent = {
  "spells": {
    "wizard": {
      "fireball": {
        "text": "烈焰爆轰",
        "mana": 10,
        "lvl": 11,
        "target": "task",
        "notes": "你召唤经验值并对Boss造成火焰伤害！（基于: 智力）",
        "key": "fireball"
      },
      "mpheal": {
        "text": "缥缈之涌",
        "mana": 30,
        "lvl": 12,
        "target": "party",
        "notes": "你牺牲法力使你的非法师队友获得法力值！（基于：智力）",
        "bulk": true,
        "key": "mpheal"
      },
      "earth": {
        "text": "地震术",
        "mana": 35,
        "lvl": 13,
        "target": "party",
        "notes": "你的精神力量撼动大地，并使你的队伍获得智力的增益！（基于：未增益的智力）",
        "bulk": true,
        "key": "earth"
      },
      "frost": {
        "text": "永冻冰霜",
        "mana": 40,
        "lvl": 14,
        "target": "self",
        "notes": "随着法术释放，寒冰冻结了你的连击。你任务的连击次数不会在明天重置为零！",
        "key": "frost"
      }
    },
    "warrior": {
      "smash": {
        "text": "野蛮碾压",
        "mana": 10,
        "lvl": 11,
        "target": "task",
        "notes": "你使任务的蓝色更深/红色更浅，并对Boss造成额外伤害！（基于: 力量）",
        "key": "smash"
      },
      "defensiveStance": {
        "text": "防御姿态",
        "mana": 25,
        "lvl": 12,
        "target": "self",
        "notes": "你伏下身体，并获得一项体质增益！（基于：未增益的体质）",
        "key": "defensiveStance"
      },
      "valorousPresence": {
        "text": "英勇登场",
        "mana": 20,
        "lvl": 13,
        "target": "party",
        "notes": "你的勇气使你的队伍全员获得力量增益！(基于：未增益的力量）",
        "bulk": true,
        "key": "valorousPresence"
      },
      "intimidate": {
        "text": "威慑凝视",
        "mana": 15,
        "lvl": 14,
        "target": "party",
        "notes": "你的凶狠凝视使你的队伍全员获得了体质增益！（基于: 未增益的体质）",
        "bulk": true,
        "key": "intimidate"
      }
    },
    "rogue": {
      "pickPocket": {
        "text": "扒窃",
        "mana": 10,
        "lvl": 11,
        "target": "task",
        "notes": "你抢劫了一个附近的任务并获得了金币！（基于: 感知）",
        "key": "pickPocket"
      },
      "backStab": {
        "text": "背刺",
        "mana": 15,
        "lvl": 12,
        "target": "task",
        "notes": "你背叛了一个愚蠢的任务并获得了金币和经验值！（基于: 力量）",
        "key": "backStab"
      },
      "toolsOfTrade": {
        "text": "行业工具",
        "mana": 25,
        "lvl": 13,
        "target": "party",
        "notes": "你的狡诈天赋使你的队伍全员获得了感知增益！（基于：未增益的感知）",
        "bulk": true,
        "key": "toolsOfTrade"
      },
      "stealth": {
        "text": "潜行",
        "mana": 45,
        "lvl": 14,
        "target": "self",
        "notes": "随着每次法术释放，一些你未完成的日常任务今晚将不会造成伤害。它们的连击次数和颜色不会改变。（基于：感知）",
        "key": "stealth"
      }
    },
    "healer": {
      "heal": {
        "text": "治疗之光",
        "mana": 15,
        "lvl": 11,
        "target": "self",
        "notes": "闪耀的光芒恢复了你的生命值！（基于：体质和智力）",
        "key": "heal"
      },
      "brightness": {
        "text": "灼热光芒",
        "mana": 15,
        "lvl": 12,
        "target": "tasks",
        "notes": "爆发出一道光芒使你任务的蓝色更深/红色更浅！（基于：智力）",
        "key": "brightness"
      },
      "protectAura": {
        "text": "防护光环",
        "mana": 30,
        "lvl": 13,
        "target": "party",
        "notes": "你增益你的队伍的体质以保护他们！（基于：未增益的体质）",
        "bulk": true,
        "key": "protectAura"
      },
      "healAll": {
        "text": "祝福",
        "mana": 25,
        "lvl": 14,
        "target": "party",
        "notes": "你的抚慰法术恢复了你的队伍全员的生命值！（基于：体质和智力）",
        "key": "healAll"
      }
    },
    "special": {
      "snowball": {
        "text": "雪球",
        "mana": 0,
        "value": 15,
        "previousPurchase": true,
        "target": "user",
        "notes": "将一位朋友变成冰冷的雪人！",
        "limited": true,
        "key": "snowball"
      },
      "salt": {
        "text": "盐",
        "mana": 0,
        "value": 5,
        "immediateUse": true,
        "purchaseType": "debuffPotion",
        "target": "self",
        "notes": "扭转让你变成雪人的咒语。",
        "key": "salt"
      },
      "spookySparkles": {
        "text": "阴森闪光",
        "mana": 0,
        "value": 15,
        "previousPurchase": true,
        "target": "user",
        "notes": "将你的朋友变成一个透明的伙伴！",
        "limited": true,
        "key": "spookySparkles"
      },
      "opaquePotion": {
        "text": "不透明药水",
        "mana": 0,
        "value": 5,
        "immediateUse": true,
        "purchaseType": "debuffPotion",
        "target": "self",
        "notes": "逆转让你变透明的咒语。",
        "key": "opaquePotion"
      },
      "shinySeed": {
        "text": "闪亮种子",
        "mana": 0,
        "value": 15,
        "previousPurchase": true,
        "target": "user",
        "notes": "将一位朋友变成快乐的花朵！",
        "limited": true,
        "key": "shinySeed"
      },
      "petalFreePotion": {
        "text": "脱瓣药水",
        "mana": 0,
        "value": 5,
        "immediateUse": true,
        "purchaseType": "debuffPotion",
        "target": "self",
        "notes": "逆转让你变成花朵的咒语。",
        "key": "petalFreePotion"
      },
      "seafoam": {
        "text": "海水泡沫",
        "mana": 0,
        "value": 15,
        "previousPurchase": true,
        "target": "user",
        "notes": "将一位朋友变成海洋生物！",
        "limited": true,
        "key": "seafoam"
      },
      "sand": {
        "text": "沙子",
        "mana": 0,
        "value": 5,
        "immediateUse": true,
        "purchaseType": "debuffPotion",
        "target": "self",
        "notes": "逆转让你变成海星的咒语。",
        "key": "sand"
      },
      "nye": {
        "text": "新年贺卡",
        "mana": 0,
        "value": 10,
        "immediateUse": true,
        "silent": true,
        "target": "user",
        "notes": "向一位队友发送新年贺卡。",
        "limited": true,
        "key": "nye"
      },
      "valentine": {
        "text": "情人节贺卡",
        "mana": 0,
        "value": 10,
        "immediateUse": true,
        "silent": true,
        "target": "user",
        "notes": "向一位队友发送情人节贺卡。",
        "limited": true,
        "key": "valentine"
      },
      "greeting": {
        "text": "问候卡",
        "mana": 0,
        "value": 10,
        "immediateUse": true,
        "silent": true,
        "target": "user",
        "notes": "向一位队友发送一张问候卡。",
        "key": "greeting"
      },
      "thankyou": {
        "text": "感谢卡",
        "mana": 0,
        "value": 10,
        "immediateUse": true,
        "silent": true,
        "target": "user",
        "notes": "向一位队友发送一张感谢卡。",
        "key": "thankyou"
      },
      "birthday": {
        "text": "生日贺卡",
        "mana": 0,
        "value": 10,
        "immediateUse": true,
        "silent": true,
        "target": "user",
        "notes": "向一位队友发送一张生日贺卡。",
        "key": "birthday"
      },
      "congrats": {
        "text": "祝贺卡",
        "mana": 0,
        "value": 10,
        "immediateUse": true,
        "silent": true,
        "target": "user",
        "notes": "向一位队友发送一张祝贺卡。",
        "key": "congrats"
      },
      "getwell": {
        "text": "慰问卡",
        "mana": 0,
        "value": 10,
        "immediateUse": true,
        "silent": true,
        "target": "user",
        "notes": "向一位队友发送一张慰问卡。",
        "key": "getwell"
      },
      "goodluck": {
        "text": "好运卡",
        "mana": 0,
        "value": 10,
        "immediateUse": true,
        "silent": true,
        "target": "user",
        "notes": "向一位队友发送一张好运卡。",
        "key": "goodluck"
      }
    }
  },
  "gear": {
    "flat": {
      "weapon_rogue_4": {
        "text": "双截棍",
        "notes": "相连在铁链上旋转的两只重棍。增加6点力量。 ",
        "str": 6,
        "value": 70,
        "type": "weapon",
        "key": "weapon_rogue_4",
        "set": "rogue-4",
        "klass": "rogue",
        "index": "4",
        "int": 0,
        "per": 0,
        "con": 0
      },
      "armor_rogue_4": {
        "text": "半影护甲",
        "notes": "将穿戴者包裹在薄暮中。增加15点感知。",
        "per": 15,
        "value": 90,
        "type": "armor",
        "key": "armor_rogue_4",
        "set": "rogue-4",
        "klass": "rogue",
        "index": "4",
        "str": 0,
        "int": 0,
        "con": 0
      },
      "head_rogue_4": {
        "text": "半影兜帽",
        "notes": "赋予在黑暗中的完美视力。增加9点感知。",
        "per": 9,
        "value": 60,
        "type": "head",
        "key": "head_rogue_4",
        "set": "rogue-4",
        "klass": "rogue",
        "index": "4",
        "str": 0,
        "int": 0,
        "con": 0
      },
      "shield_rogue_4": {
        "text": "双截棍",
        "notes": "相连在铁链上旋转的两只重棍。增加6点力量。 ",
        "str": 6,
        "value": 70,
        "type": "shield",
        "key": "shield_rogue_4",
        "set": "rogue-4",
        "klass": "rogue",
        "index": "4",
        "int": 0,
        "per": 0,
        "con": 0
      },
      "weapon_rogue_5": {
        "text": "忍者刀",
        "notes": "如忍者本人一般的狡猾与致命。 增加8点力量。 ",
        "str": 8,
        "value": 90,
        "type": "weapon",
        "key": "weapon_rogue_5",
        "set": "rogue-5",
        "klass": "rogue",
        "index": "5",
        "int": 0,
        "per": 0,
        "con": 0
      },
      "armor_rogue_5": {
        "text": "本影护甲",
        "notes": "让你在日光下的开阔地带也能潜行。增加18点感知。",
        "per": 18,
        "value": 120,
        "last": true,
        "type": "armor",
        "key": "armor_rogue_5",
        "set": "rogue-5",
        "klass": "rogue",
        "index": "5",
        "str": 0,
        "int": 0,
        "con": 0
      },
      "head_rogue_5": {
        "text": "本影兜帽",
        "notes": "甚至连思想也能被隐藏起来，不让想探究它们的人读到。增加12点感知。",
        "per": 12,
        "value": 80,
        "last": true,
        "type": "head",
        "key": "head_rogue_5",
        "set": "rogue-5",
        "klass": "rogue",
        "index": "5",
        "str": 0,
        "int": 0,
        "con": 0
      },
      "weapon_armoire_crystalCrescentStaff": {
        "int": 7,
        "str": 7,
        "set": "crystalCrescent",
        "notes": "用这把闪亮的法杖召唤新月的力量！增加智力、力量各7点。魔法宝箱：水晶新月套装（3/3）。 ",
        "text": "水晶新月法杖",
        "value": 100,
        "type": "weapon",
        "key": "weapon_armoire_crystalCrescentStaff",
        "klass": "armoire",
        "index": "crystalCrescentStaff",
        "per": 0,
        "con": 0
      }
    }
  },
  "food": {
    "Meat": {
      "text": "肉",
      "textA": "肉",
      "textThe": "肉",
      "target": "Base",
      "value": 1,
      "key": "Meat",
      "notes": "把它喂给宠物，它就会成长为强壮的坐骑。",
      "canDrop": true
    },
    "Milk": {
      "text": "牛奶",
      "textA": "牛奶",
      "textThe": "牛奶",
      "target": "White",
      "value": 1,
      "key": "Milk",
      "notes": "把它喂给宠物，它就会成长为强壮的坐骑。",
      "canDrop": true
    },
    "Strawberry": {
      "text": "草莓",
      "textA": "一个草莓",
      "textThe": "草莓",
      "target": "Red",
      "value": 1,
      "key": "Strawberry",
      "notes": "把它喂给宠物，它就会成长为强壮的坐骑。",
      "canDrop": true
    }
  },
  "eggs": {
    "Wolf": {
      "text": "狼",
      "mountText": "狼",
      "adjective": "一条忠诚的",
      "value": 3,
      "key": "Wolf",
      "notes": "将一瓶孵化药水倒在这枚蛋上，它就会孵化出a loyalWolf。"
    },
    "TigerCub": {
      "text": "幼虎",
      "mountText": "老虎",
      "adjective": "一只凶猛的",
      "value": 3,
      "key": "TigerCub",
      "notes": "将一瓶孵化药水倒在这枚蛋上，它就会孵化出a fierceTiger Cub。"
    }
  },
  "hatchingPotions": {
    "White": {
      "value": 2,
      "key": "White",
      "text": "白色",
      "notes": "把它倒在宠物蛋上可以孵化出一只White宠物。",
      "premium": false,
      "limited": false
    }
  },
  "potion": {
    "type": "potion",
    "text": "治疗药水",
    "notes": "回复15点生命值 （立即生效）",
    "value": 25,
    "key": "potion"
  },
  "armoire": {
    "type": "armoire",
    "text": "魔法宝箱",
    "value": 100,
    "key": "armoire"
  }
};
export function adventureUser() { return { profile: {name:'冒险者'}, stats:{lvl:90,hp:32,maxHealth:50,gp:244.4,mp:124,int:2,exp:2674,class:'rogue',buffs:{}}, preferences:{language:'zh',skin:'ddc994',size:'slim',shirt:'black',hair:{base:1,bangs:1,color:'brown'}}, flags:{armoireEnabled:true}, items:{currentMount:'Wolf-White',currentPet:'Wolf-White',gear:{equipped:{armor:'armor_rogue_4',head:'head_rogue_4',weapon:'weapon_rogue_4',shield:'shield_rogue_4'},owned:{armor_rogue_4:true,head_rogue_4:true,weapon_rogue_4:true,shield_rogue_4:true}},food:{Meat:6,Milk:3,Strawberry:8},eggs:{Wolf:2,TigerCub:1},hatchingPotions:{White:4}}}; }
export function adventureShops() {const items=['weapon_rogue_5','armor_rogue_5','head_rogue_5'].map(key=>({...adventureContent.gear.flat[key],currency:'gold',purchaseType:'gear',locked:false}));return {market:{featured:{items}},gear:{categories:[{items}]},seasonal:{categories:[]}};}
