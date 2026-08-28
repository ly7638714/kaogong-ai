// ===== 养成系萌宠：靠刷题/问答成长，知学习状态、有情绪与作息 =====
import { ref, computed } from 'vue'
import { store } from '../store'
import { speak, stopSpeak, speaking } from './tts'
import { chatOnce } from '../api/client'
import { SYS, KB } from '../kb'

const KEY = 'xc_pet'
const STAGES = [
  { xp: 0, emoji: '🥚', name: '蛋生期' },
  { xp: 10, emoji: '🐣', name: '幼年期' },
  { xp: 30, emoji: '🐥', name: '成长期' },
  { xp: 60, emoji: '🐔', name: '成熟期' },
  { xp: 120, emoji: '🦉', name: '智学期' },
  { xp: 250, emoji: '🐲', name: '大师期' }
]

// ===== 动漫角色皮肤（形象 / 声线 / 名字 / 人设 一键切换）=====
// avatar 为原创风格化动漫头像（SVG 参数化绘制），声线映射到真人 TTS 音色
export const PET_SKINS = [
  { id: 'lixingyun', locked: true, name: '李星云 · 不良人', char: '李星云', emoji: '🥋', desc: '潇洒不羁的热血侠客', hair: '#3d2c24', coat: '#9f2d2d', collar: '#e8e0d0', collarLine: 'M50 78 L60 70 L70 78', tie: '#2f2f2f', ahoge: true, eye: '#2f2f2f', mouth: 'smirk', brows: 'M41 52 Q48 48 55 51 M65 51 Q72 48 79 52', accent: '#d4a017', hairBack: ['M34 54 C24 78 26 104 42 116 L60 120 L78 116 C94 104 96 78 86 54 C78 72 66 84 60 86 C54 84 42 72 34 54 Z', 'M60 28 C52 22 50 14 54 8 C60 6 66 8 68 14 C68 20 65 24 60 28 Z'], voice: { engine: 'glm', voice: 'a6d7ba90-7cd6-5ef6-9f37-d259112f8be1', clonedVoice: true, name: '李星云原声' }, persona: '你是《画江湖之不良人》主角李星云，潇洒不羁、重情重义的热血侠客，说话带江湖侠气，常用"江湖""仗义"的口吻，豪爽而幽默。' },
  { id: 'xueshen', locked: true, name: '薛神 · 判断推理名师', char: '薛神', emoji: '👓', desc: '行测判断推理·方法宗师', img: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAEAAQADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDXemrTjSAV+tH58KaAPWlowKYIGHFNxTqbzQDDFKvSkNIDigQ7FKBSZpwPFIYmKMUozjNPXczrGis7scKqjJJ9AO9JsEMwAKaTxXf+Gvhfq9/GLrWJl0m2xuKuN0uPUjov4/lWZ4k+I37Pvw5doLzVovEGpRHDRWo+2vn0OMRKfYkV4uKz7C0HaL5n5f5npUMqxFXVqy8zlEV5OIkaQ/7Clv5USxzRf6yGSP3dCP512OgfHLxLrsYfwd8Gr+LTyMrdatqMWnR7fXG1jj3Ga0D+0T4L0mKeHx7q3hizuFGBbaRqMuqtnurbYFUfma8t8U66U/x/4B6H9gu2s/w/4J52CMdRilBX+8PzrQuv2nfgPa3Mklj4S1W/lc5LxaTEAT7b3GPypi/tX/B5jtufAeuxp3J0y2P/ALPWz4op9Kb+8yWRT6zRTI4pu3Brf0z44/s2eI38u6dtGkfobmxkgwf96Lco/E11uneDPAni62N34H8aWl6u3dtiuY7lV+oUhl/GumjxHhZu004/j+X+RhUybER+GzPNKK6vxF4A8S6KjSvZi8t16y2p3gD1K/eH5Vyle1RxFKvHmpSTR5tSjOk7TVhaAaMUDrWyMwNIDxTqSgY09aM0ppDQhCg80ppq0p5NMApcGgClprcGDCm05uaTmpe4ITJpwNMOaUUmMcTTc80ppMUwFpCKUDNLikAgHFOxWjoOg6zrkvl6Vp81yAcM4GEX6seBXY2vwm8RSxBprzT7cn+Hczn9BiuOvmGGoO1SaTOilha1VXhFs4jSdPvNV1CHT9Pgaa4mOFUfqSewHc12fjTxP4D+Afh+LUNcb+1fEt0h+yWkODNMenyA/wCrjzwXPJ9zxWtqcum/BH4Za34w1toby9iTEYjyPNYnEUKk8jLEEn0ye1fItprWoi5f4p+MZU1XxlrZM2kQzruisYASFuNh4AHIjToAN3vXyGc5xLESdKk/c/P/AIB9FluWqklOove/I2Pid4s+KXxJ1C10rxNdXNjLqnz6d4P0xzFiLqJrxuqpjn58seoVBzW38O/AnhDwRCbp20/WNehP7y8nYC1tH/ux54BHtl/92vK7fW9Whk1O6W+mN9qr7r68LHzpl7Rl+oTuQMZOM8AAQ27ald7YYDPKEGFCk4UfyFfOO7PcjFI9i8VTeHvEb7fFHiTUtYhBz9hsy8Nrn3VeX+rMaqadL8OtKwNO8GWykdHa2jZvzck151b6Nqpw0l0IvbzCx/Sr0Om38f3dWl+m3I/U0rW6jbPVrbxtpMShY9IliUf3FjGPyq/B400Gb5ZlniB/56Q7h+ma8ot0v48B54Zx7oVP6Vcz6ilypjUj06bTPAXiQbLjTdCv2bs9ugf+QauV1r4H+GTcDUPC9/qnhnUkO6Ka0uGZVP0J3D8GFc4AD1rY0nxBq+m4FveO8Y/5ZS/Ov69Pwos1sw0e5vaJ8U/jp8K2UeKLePx94ci+/coT9piT1Lgbh/wNWH+0K9e8J6/8L/jjpcl74Wv0sNcRN89tIgjuIz/00jzh1/21J+vavNtE8bWNyVjv1NlMeN+cxn8eo/H86w/GnwzstR1KLxR4Nvm8NeJYG86C8s2KRyP6sF6E/wB5evcNW+HxVShNSg7MwrYaFWPLJXR2nibQNU8O6h9i1ODYTkxyrzHKPVT/AE6iszNdD8KPjNp3iu3uPhz8Z47LRPE9sAqzzusMF8Oiyxt91ZPocHOR3UX/ABZ8O9c0RHu7YLqdgPmE0A+dV7Fl/qMivu8sz2niUoVnyy/BnyeOyudB81NXj+KOOzQaUYoOK9+x5I0mijHNGKBigUuKO9KKBMKUDNJSg4oCwhpM0hNAyaHuCFAoxzScjrRk0hhSigUvSi4DgPQc+1eh+HfBOnaXosvijx9dw6ZpltH5rxTyeWAvrI3b/dHJ/Sn+FdN0PwV4TuPiJ43mS1tLSLzoVkGdg/hbb/E7EgKvuO548H1a78V/tFeIl13xC93ovw/tJidN0yN9r3WDjeT3b1fkDlU7mvkM4z1pujQdu7/Rf5n0OW5UpJVKq9F/mdX4q/aO8S+Jr+Twx8B/DC/ZLf5G1e7twsaD1SM4VB6F8k/3a5HUfBXxI1pDqPj34y6vGTy0drcOkKew+ZE/Ja6XXPEWi+DtOXw/4YsLVHgG0RRLiGA/7WOWb15z6mvLfEV1qusSm4u74zzfw+dkovsAOB+FfHucpan0qpxiiz4m8B3uoeH5LKL4u3mtaLbSLd3Nhe3LSABAcsmHbDbSwHHeuJ1rUZdU1Oa9lURhsLHGOkUagKiD0CqAPwpmpPqNo2L23j8s8ebFkj8fSs6/Y+UFQhd5wWJ4AqlfqUklsMnvRkrFj03GiO61YAeVPeqg6BCwH6UWt9BZkC2tllfvJJ1P0HYVrWGsxOwW4QwMe+cj/wCtQBTg1/WrVgHuncf3Z03fz5re0vxdbSEJfwmBv+eifMn4jqP1qyFSVBuCup9RkGqN3oFlcgtEDbv6p938qVgOrhkjmiWSGRZEYZVlOQakxXAQjV/D0pkiO+An5scxt9R2PvXYaDrVtqUYkjCrMnLwvzj/ABHvRsBpJUo6Vt6XZ6Pq8RRC9jdKPmVW3KfcA9vxpuo+G9TtEMqIt1D13w8nHuOtCYGKQKu6N4g1PR32Ws+6HOTBJyh+np+FT6Fe2EDSw6hapJHLgFyuSn/1vpzVm+utNs92mzRx31hInmQyRkebCT/td/xpMDSvG8G+P7NdO8RabAbjG2PzPldCf+eco5H0/Q1S0LW/ij8CZRPod3P4w8DxndNpl0xM1onfYeqY9Vyvqo61x8g5rqPC/jW90wpbX5e7tBwCT+8jHse49j+dJXWwmlLc9r0SfwR8Z/Dr+J/h/ex2+poAbzT5cI6Of4ZEH3SezjKt+eOIvba4sruW0u4HguIm2yRuMFTXDa74WvtL1iL4m/B6++wazDl5rODiK8Xqy7OmT3jPDdsHGfafAnizw78fvBjX1kkWleMtMQJe2TnBVunflomOcN1U8H3+oyfPZUWqVZ3j36r/AIB4GZZSp3nSVpfn/wAE4qndqddQT2l1La3ULwzwuUkjcYKsOxphNfcJqSuj5e1nZhyaAKUUE0wCgUUvFFgGNg0q0lA4ND3EhSM0mKdR7UhiY966/wCFXhtfEPiQPcx7rGyxLOD0c5+VPxIyfYH1rlLeCa5uI7e3jaWaVwiIoyWY9AK7b4m+I4Pg18J5NLspTdeNPEG63022g+Z3uHG3eB/cjBBz3OPWvGzzHLDUHGL96W36s9HLMK69ZNr3VueY/FzW5vjj8X5vC9tcSDwD4SnxdmNsLf3YyCAR1AwVB7KGI+8Kv+O/ES6PZpoWjBIJRGqExDatvHjAVQOhx+Qo+GXhibwX8P7XR40gk1La01y275ZLh+pLdwOBn0XjrWF4x0aDTo4ZHu5bq/uGZ55G4DepA7c1+byfMz7eMeWJxU+FDO5CqASWJ6epNcdq+vXd7K1ro8cnljhpVX5m+n90frXR67A99J9lZilopzKFODKf7vso/Wq3kxQxCKGNY0XoqjAq0BxcthqikyNHKxPX58n+dRwxTX86QfcCD5zjp+HrXWzDDGq4jRZGcKAz43H1x0pjsMsrS3tEAhjAbux5Y/jUtxbQ3Ue2ZAw7HuPoaWJldAynINSoOKAsZcD3GizBZS01i54bHKf5/WukhZXRXRgysMgjoRVQxpKhjkUMrDBB71XsQ2lXItpGJspW/dOf+WbH+E+xpiNlU3A5AIPBBrLvNBxKt5pcn2a4Q5ABwp+np/Kul0/Trm88xbaPe8a7iueSPYd6j2MrlWUqVOCCMEGkBX0DU5pJNkqtbX8HLLjGf9oeorvtE1yV1yj7JV++nY+4rjri0aOVPPhZJFG5CRg4PoauWc0a/K4EbjlJl6qfQ+qmk0B0d/Lo2tXDQTL9k1DGcDhnHqOzj9fpXO6lpdzZMSV8yL/nog4/Edqr6n5eoReXcpnByrA4KH1B7GqkWreJNK+VXTVLYcAS/wCsA9M9T+tAA59aiNJceJNIuT/pWlXllN3MWCPyOKbDPa3A3WrTsv8A00j2/wBTQtAsavh3XL3Q73z7Rso2PNiY/LIPf0PvVzxXHf6Lq9v8aPhpL5GqWLbtXsgOJ4+N+9R1yPvDuMMORmsEjFaHh7WrnQ9QF1CPMjYbZoT92VPQ/wBKe2orJqx9E3t9o3xY+Gtl8S/CyYuBHtv7bOXQoPnRsdWTqD3Ug+lefrzzXNfBLxLb/Cb42W+nxT48CeOMCDcfktLnOFB9NrHYf9l1J+7XpvxK8Pjw74pmt4U22dx++tvQKTyv/ATkfTFfZ8OZg5r6vN7bf5Hy2dYPkfto/P8AzOaA4ozSjpTa+rPBHCiigUxBTT1p1IQaTBCA0vem85qxp1pNf6hbWMH+tuZViT2LHGamUlFNvZDSbdkd98P4tK8J+E9U+JPiaQQ2NhA7wkjkKvDMo7sx+RR3J968q8Fx6n4u8Sz/ABY8aKI9U1f91otk5yLCzwSioP7zLkk+hJ/iNdv+0QbLWPE3hf4TiVYPD2mWh17xAS2F+ywfLDGx9GcMT9Aa4rQ/ED6nYaj8RbuJorKVTbaDaMNvl2wOA+OzysMn0VVHSvy3MsbLF1pVH1/Loj7zA4aNCmor+mdBqGs29tqi2hYhIwTM4GcNjhf6n8K4zxrqcM8z3ZH8Plwr3OP85qlpN5LeNM8zA4y7ue5JJJP61gard/bbxpBnyxxGPQf/AF64YxsztbLniCw0/T9Ngg3+fqkpEkzK/wAsakfdwOP/ANVc1MmASeAKv7cD0Fcd4o1pXV44iRbqccdZW9B7f/rrRCJLzVbVZSqB5ccFl6f/AF6yPE2r+Xpqx2Tfv7ljGD0KDHJ/z61z90XnYvdGQjskedqfl1PvVeE+bcIsMr3Tj5Yo1UtJkkcAdTTFc7LwJMb7RghP7yA7WH+f8811uhyRW2qRrcRrJCyESKwyCp4P5cGuA8NJqvhnX0j1jSr7T1vk82KO5haMuAcEgEc9/wARXo2uTQ/2LaajGA0li4JK/wDLSB+D+Wc0tyldaM2dS8JYbztNlVkbny3bt7HuPrTYvDMMltPb6gd2/wCVSp4x61PpGtCC0RZN01vtBRk5IU/z+lWtS1KC4giksZ1kBOd6dMelJgznNDu7vSdSNhNJi7tuYnP/AC1j/r6Gu38vT/EFt5wUR3SjDEfeX6+org/EsU11B9riYi6tzvRh1IHUflU/h3VjcxLcQOYrhOHCnof8DSYjd1OWVYzY3SKZIThZM8gf4EVm4qa5nluJWlmbc7dTUI56UJieocUhwRgjIpT0rPvr9LO5RLn5IpfuSdgfQ+n1pjJJEweuRUMq74yu5lyOGU8j3qaR1K7sjB754qJzhSfSi4jFfVbmwuPI1GLzEP3JkGMj6VfhvLa6TNvMj+ozyPwolFnfQGN2ilQ/7Q4/wrm9V01LJ98N3E654Xf84/LrQM29a8vWfDOpeHJCRPH/AKbY54aOdAcFf9l1DIf9rb6V9PeGfEP/AAtH9m3Q/F8z+Zq2lr5N838RkjwkpP8AvDZJ+NfGl1Legx3VvM5ubc7otxJB9VPsa+kP+Cft+uq+F/iD4WKstsZY7mKNudvnRyIw/wDIa/lXVg67w9aNRdGcuLpKrScH1RdyaB1pq5Aweo4NOXrX6sj4BinNAOKUkUnejqAE80ucikNApMEOAFdX8JII5/iDpwkGRGJJQPdUOK5IHmup+Ewnb4haX5DbSDIX/wBzy23Vx5h/ulW38r/I6cJ/Hh6r8zyj9oS/vNR+JXizw7YyOmpeK9ftNEBHWKwtreFpMezPNk+oU1o/E+e3sotN8NaeojtLGBSEHQADag/BRn8am8WwWWtfts69PbRAJounI0hB4a5aGNC+Oxw4H/AK5bxhe/a/EepXbthBMwBPZV+UfoK/K5fEffR+ErRXfk6Rc26nEk8iqfZAOfzPFZrusQDOcAkKPcnoKNNuReWi3AXAcnA9skCslL2O78Sks3+i6fE8p/2mAxn8zgU0UP8AE16Y0FlGfmcZkI7L6fjXB6pMjSMxOIos4J/U1sajdPK01zIfnkJP0zTPh54Vl8d+NodEBdNNtR5+oyr1CA/dB/vE8D6k9qJSUU2yowlOSjHdm58H/hhd+O5BrOsNPZeHEfCKh2yXhB5Cnso6FvwHOSPrD4ffDrS7KxjTR9KsdJs0+5JHCPMc+u4/Mf8AeJq14H8PQXLQ2cFulvptmip5cYwqqBhUX8vyr00KqIERQqqMAAYAHpXkzqSrO72PbcYYOPJDWfVny5+0f4JufEXhGS5s4WOtaHI1xAAMs6j/AFkY9cgBh7r714b4S1yG70ryLhv9HmUo3/TNiOR9O9fdXjjSSf8Aia268jAnAH5N/Q18W/HXwc/gXxYfEGmQH+wNXkJkjQcW8/UqPQHll/Edq6MJU5f3b+Rhj6aqxWIh6Mp+F9V+wyHTb1sRhyEfPCn0+hq1qxudHv8A7VZviC4OWTqu7uMfrXF3FzFFJHdBw1pPgFx0Vux+h6fhW/aalmzawvd0lsw+Vhy0Z7EeorvaPJudBYa/aXACT/6PJ/tfdP4/41i3Pm6PrJltiNh+dP7rKe1Zb/u3KMytzgMDw30p25ioUkkDoM9KEh2O+068hv7YTQn2ZT1U+hrJ12S80q6F5atm3lP7yNuVDf0z7Vz+n3k9jcCaBsHoynow9DXX2l3Za3YyQHgsuJIifmX3H+NK1iWrFSy8Q2VxhZybeQ/3uV/P/GrGqW0eoWLw7wQ3KMOcHsa5DVLGXT7xreYZxyrdmXsaht7i4t2zBNJH/utinYZa0/UbrTJWtLlDJCpKvE3VfXH+FXZL2ezX7TYyfbLDujH54fY9wPQ9Kybu4mupfNnIaTABYKATj1qKN3jffG7I3qDRYCxqUllcyC5tQ0bOf3kTDofUHoRVYCmkfNngfSlJIFCAXFdf+z58S/8AhUPxMbUrxHfw3rIW31NUXJhIOVlAHUqSTjurMOuK4q4USxNGxIDDBIOCK2/g38LfHPxWm1Kx0G/0pINOljivJL6TDIr7sMFCkt909O9NETt1PsDx54a0e40geNvCF/a3ujXREj/Z5A8a7j99GHG3J5HYn8BwQxXTaf4b8OfCP4VN8OtE1E6pqV5P9o1S66Av8uTtBIThFULknAyeTzy6tX6NkdSvUwidb5eh8TmkKUMQ1T+fqOxQOaTOacvWvXR540nmj6UHrSgcUMEIOtdj8GmVfiDZg/xQzKPrsJ/pXHitTwrqX9j+I9P1M52W86s+P7h4b9Ca5cbTdXDVILdp/kb4eap1oSeyaOFe8TQP2lvjJfXwINpZm+APUoojcfmCtefeMLp00aJ2OJL0hm+hG5v54r0L9uLSbzwp4/8A+E602PzdO8WaHJpF269BKFGCT7oIyPXY1eU+L7lbrTfD0yH5JtNSX8SAD/KvyqSs7n38HdDtN1AW3hedlYebExRR7t0/r+Vc5p90Yrq6t8nM1soP035P8hRubYU3HaSCR2JHSqDv5OuwE8CaFkH1BzTLZY1qfyLVpeyKT+PavoH9mrwv/Y3w8t9QeIm/1t/tUhx8xTJES/llv+B185+JEea1htY/vXE6Rj8a+9fh3o0UF7Y2aIBBp1uqqMcfIoVf1/lXFjpPlUF1PUyxJSnVf2V+Z3egacul6VFaDBcDdK395z1/w/CrxpxFJjmubZEObk22IQCpUgEEYIPQ15p8T/h/Y63oV/ptxAZtLvIysiqMvbt1V1/3Tgg+2DxXpqj2pcUmrmlKs6b7p7o/OLxZ8PNe8LQ6kEtXv7GywNTt4xl4Ub7lyncwvjhv4WBRsEAnjNJ1j7Ixt5mae1X7koHKg9M1+kPivwTbapcw6ppU66ZrFqG+z3ATchDffjdf4o3wNy/QjBANeIeMvgLp+q6udR0G3t/C/iQ5M2nugm06/H8W1eMo3fbyO6A81208TpaRyTw0W7038mfN4MF3b5R1kicYyprOttTezujYam2Cv+rnPR17Z9/evcfF/wCzpd22L/wxfnRLt1DS6fdb5LYPjlUlI3bc9NwPHevK/Fvw7+IFlAY9X8H3dwsZOy704CdfyXJx+Vawr05bMipha0NXH7tURgggEcg9KWOZopleOQxyLypU4Iq7oPw58X3vh0az4WgnvY428u70q9jMNzBIBk7N2BIpHIKkHsRkVgay91YN9l13S9S0W6U/L9ot2Xa3qCRzWimnomZyhOKTkrHTzapFqdqLfVF2yL/q7hF+6fcenrisi4heFsMVZT910OVb6GsjTtZgmfyLiWNZB0dT8j/4H2NaTjg9cdTimZrUQsBSggjNVLmdYrUXQw8ORuZTnAPGfwp6tkZB6jPFMZYJApC1QyHehVu4xkdqbbM7R/vBh1OD7+9ICVjXvv8AwT4d0+I3je2A/dPZQO3pkSED/wBCNfPOpTGCzlmU4KjI/Ovpv9gawax8P+PvHc6lbeSRLaBj0IhRpHx/32gqoRcnZGdVpK7LU6BLqZE+6JXA+m40wA5pyktlm6nk/Wl4r9cSaSR+dNpu4KKcODSCg9KEAYopc5oxQwSsJ3pcUnenA0Azv30W3+KnwL13wdqdst1eWcLCwdj8yTBCbdwfUNlfccHqa+ItCvV1TTdA0OSTZf232m0kRh8yqp8xOPcsy/8AAa+xPhz4nXwtrrXNwjvZzp5dwqDLAA5DAdyD+hNeQ/tbfC3TfAGuab8WfC8txJY6trHn3NvtHlwM6iQbMc4ciU89MgCvzzPME8PiXJL3Zar9fxPscpxSq0Um9VozxfPFZ2uQySW6TwZ86Bt64/Wt7X4IrfVZfs7brabE9u46NG/zKf1x+FZF7O0UeIk3ysCVHZQOrH2FeKew9RNNuodR1jw46EYOqQLIn90l1r9ALDXNH8J+HdY8S69draWNuwDuRkn0VR1ZiSAAOpr5A+B3wft/GHhix8VTatdWV4mqkxpHEHWWOMocYJGGLbuefpX0n8VfhDr/AI/utFtP+Eng0nRrGNppbZbZppXunY5fGQpwmFGenzcc1wV5RqVEr7bnpUlOlhndfFa3oeS+N/2hPHGtag58Pyr4c04H91FGiSXDDsZHYEZ/2VAA9T1rnY/jP8U0OR4wvm/3oIT/AOyV7OnwF+E/hyEP4q8SXszAZZr/AFeOzQ/8BTaf1NMOl/sqab8sl94NlYcHzNVkuD/6GatSh0X4HG0+rPMdL/aE+J9jIpuL7T9RQdUubBRn8Y9pr1X4b/tIaTrWpW+leK9KGizzuI0vIZTJbbjwA4bDICe/I9cVWab9lGX5PP8ABS+6ySp+oxUtr4L/AGatdmC6XqegM5P+rtfEDJn22mSpbi94sqLfc98NRzwxTxeVPEkqZztdcjPr9femWrR/Z4xCVMIULGytuUgDAwe9TVzHQGFMflkArjGDyP1rN1Oy0K3tZ76+trWCGCNpZZiNgRFGSxI9AK0WOBWN4sGjzeHb+38Qz20GlXELQ3TXEwiTYwwQXJGOPfNG+jKi2tU7HzF4/wD2hLqWS4tPBOlWemWBOFvb6MT3EgHRlV8rGD1xyfWvJtQ1rxN4skK399q+t5bIjxJOgPsigqPwFfRen+KP2cfC90LXQrGw1q+XoNO02XUpj/wMgj9a6+x+Lt9PH5Xh/wCD3xDuIgPkZtOjs4z9N7f0rqi+X4YnPOTe8rnyHJ4F8RX9v5X/AAhevPGehXSphj3B2Vj3fgjx3oo3x6NrKQDkJd2EqgfiVx/Kvt3/AIWN8QCN3/Cj/FJX31O0z+W6mv8AFrX7LnVvg38Q7aP+J7a3iugB9EfNWqs+34mNos+EdD0rWNV8RLpUMcNjc3xMaw3D4gnlI4TP8BboCeM46Zq3448G+JfBk1vpurwPG0iCWwukOUc7ctFuHG4cjHqOMgg19pH4j/BXxTq0Fn4hhstP1VJEkih8RaUbOZXDAqQ8igZBA/irsvEXhGz1GPz7aG1njZhL9nmVXjY9Qy5yB7fpUzxE4tPlOihQo1E4ylZ9H/mfnLp11qstukqww3MbfxBwrD61qwGTYDKgRj1UNux+NXvFOit4Y+Ivifw0UMa2V+5jQ9VRuVH5FayLvU7K2YrLMCw6heSK607q5xtcrsw1O3mv3stLthunvrqO3jX1LMAP1Ir7x8Y2Gj/Df4d6X8OPDFq0Fo8bNI7Nudl35Yse7O3U+gx6V8b/AACn8Pap8efCUuuapZ6fpdldC5aW8kEatKmWjTJ4yXCdcd6+wPjnb6n/AMJUl9cQEWDQpFayg5VsAlgfQ5J49K9nIqMKuMip9Nfmtv8AM8jN6soYeXL10OAB4pM0CgCv0ZnxiFB5p1NxTxSQMYoOacaG4ppOaCkAyaetR0u6gRZsrS5v76CytIjLcTuEjQdya0/2nvE3h3w98Kbf4Q3ttdeKvE+r2yx2VnaD95C+7MUpwCQAwwqgEsFI4GTXS/BS3totQ1XxFekLb6XaFix/hyCWP4Kp/OuL/ZJ0+Txfrfin46eIYhNq2rajJaaV5gz9lgUDds9OCsYPYIR3NfD8S469T2PSOvzPqMkwvue06y0+R43afs6fHSXw3aSSWGlQi3iPkWVxfRC42k7tvcdegLcZryzWI9b0XUL7QvEWj3OnalbqyyQyRlXXg4O09R7jI71+kd94r8M2etLo994j0i31N8EWs17Gspz0+UnPNfPf7eWgR3tn4O1xwY1huptPklQYZfMQPHz6Ao2B7+9fI08Rzys1Y+knQcI3uJ+zpr2meB/2Xz471WE3EWmvciG3U4MsxnKquexLMoz2GTXf6R4E8feOLKHVfiN451PSoLpFlXw/4cf7JFAjDISWbl5GwRn3718maZ4X8eSfAq68Uw+KDJ4QttTCX2ktPIMSLMg8wJgoeXUk5B+tfogrAorKRtKgjnjGKyqJU22t22bKUqtlLokefaZ8FfhNo6tcf8IbpdyygvJcakzXTcclmaZiPxrh/FPxs+Ang6Z7HTNM07VZ4iVKaLpELRg+nmkKh/AmvM/ij4x8Z/H74kSfDX4dyNH4bt3InnDFY7hVOGnmYc+UDwifxcHBJGK/wi+CvgDWfj/rXgPVdTur+08OWgEymXyX1K6BUS7QpykaEkbVO7gEnk1rCi2rzZhOok7RR2Np+1B8KrmcRX3gPUbeA8GQ2NrLj6qCDXpPhjT/AIH/ABV0uS+0jw/4W1dFwJlGnpDcQk9nUBXX69D2Jr43/aP8J+G/BPxf1jw54Vumm0238thG0vmG3kZAXhL/AMW0+vIzg8iuv/Y88P6rqvjO81bwxq/2PXdF8m4e0mP+j6hYu+yeJiOVYfKVPIyR0IzTnR0912HCr3R7b4/+G178K9Gu/HXwj1XUdOGlqbq+0Ce4eeyu4FOZAFYkqwXJ6ngHBBxXqmm/EjwXP4V0vxBf+JNI0uDUrOO6jju76ON1DqDggnOQcjp2q38R9V0TRvBOrXXiC/gstOktpLd5ZiQpMisirxzkk4xXgv7OHwS+Hev/AA00TxNqGiQ6leXlvunku5XkUOGKlVQEKAMd81zXUo3mdCi1K0T2uP4ofDe4SQ23jrw5cGNGcpHqMe4gAk4BPJ46V5l8MfAtv8WbWL4n/ExZtVXUZHl0bRJZWFlY2oYqmYwcO7YJJPB4JyTx0Hir9n74a3mjXaw+FNLhmEDmOS3RoHRtpwQVbHBx1qH9k7xpouvfC3RvDdvPIur6Lp6R3cEkTJ8okdA6E8OuRgkdDwaLpRbgDT5kpO6PRr248MeBPDdxqEq6b4f0ezj3SvFEsMaDoBhByScAAZJJwK+afHn7X5S9ktvBXhmGWFSQl5q0jAye4iQjA+rZ9hXuPxm8B2njSwivfEN07+GvD9vcalc6bGzKb64RCYw7DpGqh+ByS3avCP2XfHfwT8NfCLWofGsWmx61dTTPe281kZXvIWAMccXykbcZXbkYOSfWtqNFSjzSMa1Vp8sTmbH9rj4iw3Ie80bwzdQ55jFtLEcezCQ/yNe3fB/9pbwd42vYNH1aB/DWszEJEk8oe2nc9FSXAwx7BgM9ASa+FJ/KeeRoY/LiLsUQnJVSeAT3wMCvpH4Z/CTSfjV8B/7TsY4dP8ZaNcyWH2xRtjvVVVeJZ1HBO1wvmD5htGcitXQjJWM1VlHW59deIdF0nxDp8mna9pdpqlnICrw3cQkX9eQfcYIrw/wJ498MfCC88XfD/wAX+I/s2n6Dfo+hLPvlnaznj8xYlABLBCce2a2/2SfF3iDxD4DvtC8VQXS6v4Yvf7NnmnB3SKB8qse7pgqfUBT3qjp/gPwh43/aD+ImqeJtCt9XGltplrarcFjGrm13PlQQG/h65rlS5eaM9job5rSjufJ/xv8AFul+N/il4g8WeHLe/FjeCIkTARkhI1Qs2CTyVyBkV9dfAP4C+EvBHh601DXdJsNe8S3EYlnnu4hLDbFhkRwo3AxnBcjJOegwK8S+MnhiDVv2sofB2nWkNvb6jLpUXkQRhEjhWMNJhVwAAqnpXt/iv4neIvE3iy68HfCaCxkaycx6jr9581rav/zziX/lo4/HocDvWtWo1FcuhFGlzzd9Ts/iD8LPAHjvQ5dL1nw3p9rKykQX9jbpDcWzdmDKOR6qcg9xXm37PWoaut/4p/Z48e3P2q/0SMyaPePkmS2GNpUnnCho3XqQrFei16h8PbTxRptpJbeKfFK+IZ5GDJKLBLYx8cr8p+YemQCK8x+Iv/Ep/bS+GGq2oCS6lp81nc4/jUCZRn8GH/fIqsHiZqej1WzJxuGio2a0Zm3MMtrdS2s67ZYZGjdfRgcH9RTVFdB8T7dbf4g6widGnEn4sisf1JrnhkV+wYer7WlGp3SZ+bVYezqSh2Y7BpaQGlrZGbEY8c02lem5oe4IKKKUUAzufCCvL8HPiLBBk3DaZcBAOuTbSAfrmq/7HDwv+zb4aEOMpPeCXH977Qx5/AirvwS1CCDxFdaPdBWg1O3Me1ujMuTj8VLCuN/ZYuJPA3jnxv8ABHVn8uewv31HSN/HnwMBu2/8A8p8f7/oa/NuJKMo4mfnZn2uR1YujDyuj0Px94C8Da9bX0/iHw3pszTEtLcrAqXBboCJFw27p3r59+INvrel+E7r4aavf3Gp+H9SZX8MajcsDNY3kZ3RW0jd1flAe27IwMgfVPjWzln0V2hUsUdZHVRyQM5/xrybxjoFl4o8NXuiX+RFcx4SRfvRSDlJF91OD+nevj1WdKor7H3NHCwxOHl3OC/Zu01/GH7Lnj/wwIj9rku7xY42HKyNDHJGMf76Yr3LwNev8QfgLpstvftZ3Gr6B9le5jGWgm8oxOwHqHDUz4SWnhrw9KdFgNlD4u1DTrbWNbjt9+2dyPKNwM/KAzhiQMcsSRzWP8Ktvgj4ieIfhldHyrO9uJNb8NE/dlglOZ4F/wBqN8nb1wSa7JPmu16nhJOLSl6HT/sxfCu1+F3w8jspltpdcvW87U7qI7g7AkIikgHYq8AepY96+I/inod1bfGjxgs5nF2NdumQRsVbDSF1II55Vgfoa/RGzv3tGIA3oeq/4V5B8bPhWnizxUni/wANS2ttqk0SwahBdZVZ1XhZFcA7XA+UgjDADoRzt9YjKHmTDDuNTXY+KB4N1I6hJJd20kdmQzb1cFhnpnqc565r3v8AYO0O6sfiB4v1LO+1ttJjtPMAwC8soZR9cRk12Nj8EfEkjD7TqWk2w7kF5cfgAM/nXsHww8E6V4E8Nf2LpW+aSWZrm8unUCS5mPViB0AAAVRwAPqTmsQ2nc3q4eEbcpyf7Utmk3wb1TUPt8llPpTpe2pWMOJZhmNIyp67jLgEcg4I6V13wi8OHwh8MfD3h2QbZbGwjSb/AK6Ebn/8eJrkPEdxb/Ev4iad4U0uQXXh7w3epqPiC6jO6GW6j5t7IMOGIb944HACgHmvT9WL/YZCpOSRn6Z5rKbcYJBBKdTQsJIki5RlcV4R8EfBujeDPjp440pvtS6j5Iu9IDzHyTptxJvcIn95ZhtY/T3r2LRC5uHxnbt5/pXPfFTwtqeqNpfinwq0MfivQJGlsRK22O8hYYmtJD2SQdD/AAsAeOTU0Z8ys+pWIp8ktNbHa3FnFqWl3+kTttiv7aS3Y+gdSv8AI1+c8fgLUYX1Hw9fItjcafO1ncllyRKh647g8HPoRX3N4N+JvhTxLIbD7cuj69Cdl3oupsLe8t3HVdrY3j0ZcgjmneM/h14b8Vap/a+oWdxHfsgSS5tZPLaZR93fwQxA4BxnHGcVr7SUI8vUzpxhKfM9nufDsPgOKy0torkR3jbizSoCrL9PYV9afsK6BJoXwXudRuspHquqT3UDMMboVCxK347GP0xWg/wY8HSIYrm21W5ibh43umUMPQ7QDg9+a7PUNW0jQdNihv8AUdN0iwto1jiSaeO3iiRRgAAkAAAU6eJcb3V2XXoQlZQ0RqQ21nBcXUlnaQW32u4aeby0C+ZIwALtjqxAGSfSvOfgJ/xMrDxV4w6x+IvEl3c2zf3raIi3iP0IiY/jWX4q+I8fjK1ufB3wruW1fVL1Tb3WtQRt9g0qJhh5TKQBJJtJ2qmeec8V6V4T0ax8O+G9N8P6WjJZafbR20APUqoxk+56n3JrOd1H3t2TFJv3dkeHftB+Ef7C8WzePNBvbiTxZ4nSPw9psRQBLHdHia5VhzkQow/2d5OemNXwl4f07wr4ds9E0lNkFqoG/o0j/wAUh/2iefyHavR9YhsPGGl22o6JLaXxs7qeJJQOjqTFKqsRwQylT2OKraT4QupJ1fUSkUIOSituZvbjgVzV5TnaFtj18udChCVWT1f9fidFogeWztrmQYd4lZvqRXiV6T4v/br0Gyt/3lt4Q0ZprojosjqxwfxnjH4V6v8AFPxro3w58DXviXVGQR2ybLW3Bw1xMR8kS/Ujn0UE9q8p/Z30rU/B3w11/wCKvipifFfjabzoFkGGWNiTHx2zuaTH90IK9PLsNKpNRju9EeDmGJik5PZak3jq9W/8ZavdodyNdOqn1C/KP/Qaxs8UD3JJ9T3pDX7JSpqlTjBdEl9x+Zzm5zcn1Y5elOHWmr0paslsG5phFPNMNJgNpQaWmk88UrDJ7W4ntLmK6tpDFPC4kjcfwsDkGt34z+EtR+ImjaP8Vvhy32Tx/wCGiC8MWN9wi5JiwfvHlioPDKzKevHOA5rW8Ma9qPh3U1v9NlCt0kjblJV/usP69RXkZvlf16nePxLb/I9DL8b9Vnr8L3/zO3+Bvxf0L4m6V5PyaZ4mtV26jpEh2ujDhnjB5ZM/ivRvU9tP4f0aefz5LCMsTk4JCk+4BxXkXjj4aeAfjBfJ4i0DVJvBnjxCJBdW52tLIBwWAI3n/bUhsdc9Kxw37WXgkfYpdG0Hx7aJ8qXYdRKR23fNGxP1B+pr80xeXTpzcZRs+zPucLj0480Jad0bvxQul8KftJfDXxE+IrDWbe48PXbDhRuIaIf99up/Cu++IXhDRvF2nR2GsRTxz2k3nWd5aymG5s5h0kikHKn9D3FfNXxn0n9pDx34Sl1jxN4R0vQdK8Pk6pHDbun2jfGpy6/O7kgEnHyjj1Ar6P8Ahh4wtPiJ8OdG8YWjIZLqER30a/8ALG6QYkUjtzyPYg96561OUIKS3RvQqQlUcXszlptK+Lejpiw+Imh61bqQqf2/o+2b0AaWBhuPuRmn/afjgr+X9i+G0rYzkXV6vHrjaa7y7sRcTwPIx2wtvCdmbHBP0pYLTy7ua4LszS4HP8IA6D+dcbqzb1R6SoU1HRs4iK2+OF6dkmr/AA+0hD/FBY3V04/77ZRUx+GGu63GYvHPxM8Qazat/rLDTY49LtpB/dbysyMPbeK9Ct0xirY6VrGbOSpTV9zP8N6Ho/hvRYNG0HTbbTtPtxiK3t02quep9ye5OSe5rQIDAggEHgg1jeMPEVn4X0hdV1C01G4tBMsczWVq07QKc/vHVfm2DHJAOMjiqGlfEbwDqaA2PjPQZCf4GvUjcfVXII/KnqwUXbRHTxRxxLtjRUHoBTqwNS8b+DtNg8698T6RGp6BbpZGb6KuSfwFYNz8RrjUVMXgrwZr/iCVuFuJrc2FkPcyzAEj/dU0krjtLc6LxX4Q8LeK4Fi8S+HdL1dUGEN3bK7J/ut95fwIri5fgf8ADa3O6w0nUtO9rLWryFR9AJcV2Pgey8U2mmzzeL9Ytr/ULqczeTaQhLezUgAQxk/M4GM7m5JNbkiBhTcpR0TIUY31R5Hf/CDwMhiFzF4hukkkEeybxDeMvPt5lLZfCz4a6dJdTWfgTSJrm1IIa7ja4ZuM5BkLe9epy22RyAcc/SoTbnPA5PtWTlUfU64exVvdKOmRW8NnDHZ28VvAFBSKOMIqgjsoAAqj8Q/EcXhD4f674mmYD+zrKSaPP8UmMRr+LlRXQJb45PFfO/7S+qXfxD8d6B8CPC0xae6uo7rXZo+VtolG4K3+6uZCPXyx1NXRpuc0mY4mtGMNDtf2Z9b8M2HwS8N2T+KNGkuxbNPeKdQi3pNLI8jhwWyGBbBzV74i/Hr4Z+CrOQzeILfV78D5LHS5FnkZvQsDsT6sfwNcZ4k+An7OFvq89pcSatp09uQkkVvdysucDuVbn1wetaHhbQfgT8P50vPCfg19V1SI5iu77dIUPqDLnafdVBr26eS4itK8YN38tPvPEnmlKnGzktPM53wn4N8UfGLxLB8T/jLbjQvBml5l0nQZSVEi5yGcHkqcDJI3ScAAL16Dx/4nl8U615yK0Vhbgx2kJ42r3Yj1OB9AAKb4u8Vax4ouA+ozBIEOYraLIjT3/wBo+5/SsGvuMmyRYP8AeVPi/L/gny2Y5m8T7kPh/MBQaKFr6E8hDl60/ANMHTNOBoAjJpR0pMUhzQwQpIpp9qU0g9DUjACng8YpKUUwExnr1ByD6Vvad4w8VadEIrTXLsRqMBZGEoH/AH0DWFRntWdSjTqq1SKfqrlwqTg7xdjufC3xH1mDXo38Q3z3umyqYp4zGoCA/wAYAAzjuO4zXn2pRah+zR8R5tc0+2m1P4T+KJg80dv8/wDZ8rcqV7ZAPy/30+X7yg1Yxmut8JeKbW30mfwv4psY9W8N3aGKWCVBJ5anrweq98dQeRzXzec5JGrH2mHjqt0uv/B/M9jLc0dOXJWej69j1nRb/Sde0e11rQ7+DUNNu0ElvcwNuRx/QjoQeQeDVvylFfOE3wv+IXwsvJvFvwB1pPEPhi7bzrnw7dSeYD6hckbyOmQVkHT5q6bwL+0t4H1e5/sjxhBd+B9ejOye11NGEIfuBJgFf+Bqv1Nfn1bCOLdkfZUsWpLVntIAHSn4qGxubW/s0vbC5gu7WQZSeCRZI2HqGUkGpx7Vy6o6ea+wAkYIJB9qq3GnadcvvudOspnPVpLdGP5kVaNAphYitrW2tube1ggI/wCecSr/ACFTElj8xJPuc0lJQAtFFKFJ6An6UA3YQ9KQCuA+Ivxm+G/gOORNc8SW0t6g/wCPCxIuLgn0KqcL/wACIryg+L/jf8cs2Pw+0KXwP4TmysmtXrFZ5k77HAzyO0QPu4rWFGUzKdeMTrfjt8a4fDF0PBPgaI6747vm8iC2t180Wbt0ZwODIOoTt1bA4Nb4W+DY/gl4Tvdb166TU/iN4jBkupWfzDCCdxXd3Ablm/jbAHCg1N4K8L+APgfYzQ+HgPEXjCZSt3qtxhipPUZHCLn+BSSf4jXP6pfXuq6hLf6hcNcXMxy7t+gA7AdgK+vyXIZVGqlVWj+L/wCAfNZnmyinCm7y/L/glaR5JZHlmdpJHYs7McliTkk+9C4FDdKaM4r73yR8mPzSGko6igQZpRSYpR1p3Cw6hetKKByaEDEbpTaUmkptgIetJS4pcVIxKctNApeaLgONNpeaKAAU7qMUlAFMRo6Drmr6DdG40m+ktyT86feST/eU8H+ddLreseAPH9otn8S/BdleyKNq3kMeXT6MCJE/BjXFZAp25dua8/F5ZhsXrUjr3W/9ep14fHVsPpB6dugQ/s9eH47ttS+Dnxd1bwzdMdwtXuC6k+hwUfH+8Gqn4y1n9pn4QaBPrniPV/CXifRLVlVricqJDuIVVAAjdmJPQbj19K63wh4L1XxJewObSWHTt4M1067QE77M9T244FcH8UPEkPxN8d3EWnbT4A8BMIbZVbMeo6kflT/eRcE9/lUn/lpXw+aZfh8PUUKc+Z/l8z6nL8XWrx5pRt+pD4f/AGvNVe6Wy1f4aST3BXcRp14+8gdSEZGOPxrqLb9rvwEp26p4Y8Wae/cGCJwP/Hwf0rwz4U6LqQ/aWsdPhjZ38q6mhbON8Ridgc+vJH1FfSt1aukhhvLf94vVZUyf1r5rFThQny8p9TgMG8XTclOzXSxjS/td/CxV/d2XieVv7osox/7VrPn/AGs9Iusr4e+HPinU5D90MUQH/vgOa6EWdoDlbO2B9RCoP8qnTKDCkqPQHArn+tQ6R/E7lk0nvU/D/gnm3i39oL40DQbvWNP+G1j4d063TfJc3++Z1UkAEKxTJyR/Ca8ssfHfjH4heLdI0r4mfEfWtK8O6rII3msNscMRb7odF2qFJIBJzjOecGvfPinpTal8LvE0TtHDGdNlfzZW2oCo3DJ+qj86+WNE0oXfhVba+Jzcr5ik9UH8BH4AH8a9DAtVk3ax5OZ4ZYaajGV7o+wrL4Y/Bj4P3UCp4Sudf1kxiWK61PEwPOMgsPLUg/3VyOKd4n8f+IdeVrdZ10+yI2/Z7Ulcj0Zup+nA9q5j4A+Mbf4lfDcfDnxLqVtbeNPDrCPT5LqUK15ABhcE8sdvytjJwEbnmtTXfC+v6Ax/tPTJo4x/y2Qb4z/wIcD8cV9xkVPATinJL2i7/ov6Z8Xms8VGVk/c8v1MpVAGAMUvekByM0nNfWnz4uAaTFKOKQnNSAYpKWkIqhCjGKMUlLQwFFKKQUooQmhpFJmlJpKOoIMUtANGaYw70oxTTTgKloBCOaVRS45pQQOaYCgdj2oPYdycD3rqPD3gvUNRsX1bUriDRdHjXfJe3jBF2d2AJHHuSBXOXnxk8HaJqTaF8H/Ct38QPEaDDai6kWsJ/vb8dP8Ad2j/AGq8bG55h8LeMfel2X6s9HC5ZWr6vRd2dJoXgDXdTgN5dJHpVgq73uLw7ML1J29ce5wKwta+KPwo8FXw0nwpY3fxK8Uk4SKyXzIEf/fAK4/3Q59SK43xhpHirxRGNV+O3xD+y6eTvj8PaTIIofYHHDH3wx/2qgsPEEel6cdL+HHhi38P2DDDXkibZZR6ljl2/X618vis1xeL0b5Y9l/Vz6DD5bQoa2u/MT4u6z8VPE3hPU9S+Iviq38JabHZyS2vhjR2/fXBC/KszAk7c4zuJHXgVS8OtZ2fw68M6Dpkax28Nkl3dFf+W11KoZ2PrjIUfT2rE8XaJJceGdZub69uL68ezlYFmKruCk5xnJP+8TV3wdKJvCWkSgjDWUX6KB/SuCEFGR3NhrFvrFreWHijwxJ5XiDRZPPtTjIlT+OJh3VhkEe9fTvwz8YeHfil4Lg1q2t08xf3V7Zyf62ynH3o27j1B7jHfIHwz468R3viW/lsdJmkj0ezbDvGxU3Ug9COw7fn3FafhbWL7TNVg1/wfq02m65AAC+8/v8AH/LOdDxIp6c5rkxWHjX23OnD15UXdH3Dd+DLZ3LWt1JGP7jjP61UPh2a1ORamXH8QO6rHwi8a23j/wAA6d4lhhFtNMrRXlsDn7PcIdsic84B5GexFed/tAfHjT/Bc8/hbw3LDc+JduJ53XfBpuRwWA5klxyIx7FvSvFWG5pcqWp7SzKpGN27o4n4+61N4k8Qw/C7TZXjt49l14jnTjyYgQyQezNwSP8Ad964DxFobtPLeWAGwniADGxQMAL9ABxXEvrviEpI2iXM9jvmN1cT3WHudSnJy0k55ABycJyBnnJ5rsvBni2DX43tLqIWeqwD99bnow/vJ6j27frXv4WlGjDkR4mJxEq8+eR55r1lZzeI9Pe7ik2zK8TNG+x1ZRlWB9R716z4H+KPxh8DQxrpWvx+L9FwMWGrgtIE9FkJ3dOMbiP9muS+Jtvbre6FdLGBM98VYj+IbD1rf0zQB/ZdvJFPPZ3BTcwHzIc8jKHjpjpitXBNu5geqaD8afg74ynFl4t0u9+H2utwzuv+jM3++BjHuyr9a63VPAOqR2S6poVza+IdMkG6K4sZA5ZfXAJz/wABJr531TTJ5YDBq+kw6lbj+OFd5HvsPzL/AMBJqn4Q/wCEj8H3raj8MfGN3pEgbdLYSyGS3c+jowP/AI8pPuK9DDZni8LpGXMuzOCvl9Cvq1Z90ezOrI7I6sjqcMrDBB9CO1Nqto3x50jVBDpnxv8AB76Lcv8Au4fEOmRloHP+1jJH0Bcewrsr3wVJdaSmveENTtfE+iyjdHcWTh3A9CAeSO+OfYV9Lgs9w+IfLU92Xnt954OJymtR1j7y/rocsKDSDuGyCDgg9qU17ljzBDmnCk70tIB1A60mKBVCGkUhpT1oNDQBRRS0hgMmn4pAMU80wGE4BNdHr+qeF/hJ4ZsvEnjC1l1XXdRONG0OEZklfjGRz6rkkELkAAtxUvw00SPWfFERutosbIfarpm4XavQH2J/QGuA0jXYfH3xO8S/GfU087RtKZtK8MwuOGVeDIAe7FifYyH+7XyvEGYThJYak7X3/wAj3snwUZ3rTXp/mReK9L8U+P2i8QfG/wAQtpejl99j4V01yqjuA+Ml3+mW916VJ/bk1lpo0bwbpNp4W0peAyxK1w/vt+6p92LNXP6bcyy6leW105eSAhrcsSdtu+SqLnoqncoHoBWlivl4U0j6JsoRabbLdteTCS7vGOWublzLKT9T0/DFXMZ60pBBorZIhkM0SSxPDIMxyKUb6EYP868il1i7sfBS+DoXZdVW8l09yOqQqdxYfVWAH417GeRWdHoekprr64LGL+0XQI0/OcD26Z6DPXiplFvYaZx/hTwKI7SL+0A9vAo+W3Xh292PbP5/StK98PjSrk3um2wntCd0lvtDSRH+9GTyfcda7BqSmopBzGV8O/iM3wq1bUdXKPd+GtYt3llijBYQ36ofKkA7LIQEb3wT0rza3VpraTUtVYy6heO95eTH7zSyEs388Vv/ABLEMt3Y6PDEFjkZr+9C8bkQgKMf7TkflWjpmmW8EMpuY2N9H5bFWIKoGbGRj6EZ9uKwVOKqOS3Zo5txSMfw94Wur2E3F4WtEcblBGWPpx6D9azvEnhDVbaWO/smIubY7obqAcr7MOuPzr1JvvH60DitXG5Fzy6w1JvFnirw3azweXNYGafUIeyOoAH4Hgj64r1DFQRWNlFfS30VrCl1MoSSVUAZwOgJqxTjFrcQhFVL7TbK9Ia5gBkX7sqnbIv0Yc1coqrBcyPI1bT0kS3aHVbKQYltLpFPmL6EH5H/ABAPoaZ4US/0HVm1f4P6rf8Ah/xC7ZuPDkwMlnd4GW+Vz8gx/ez1AVhmtrrxWZod5NcTSatE5XMxFqw6iNDgH8WDH8RWcop7lJnr+geINL+MPgG68Wadpy6X4r0Z/J1/TACCGGcsAeexIJ54ZTkrmudUd6wj4gT4efF/w38VLXEOg+JCNK8SxD7iyHjzSPbAbP8AsN/eNd/8RNCHh/xVc2kI/wBEl/f2pHTy27D6HI/AV9Pw9jpO+Fm9tV6dj5zOcIoNVorfc57FFBoBr6g8IcPejim0uaEDAim45p2aCabEhDRQaUCkUKMUpOKTFXNC02TVtas9LjzuuZljJ9AT8x/AZNTOooRcpbIIxcmkuo74uaxdeCv2d5LTTgw8ReOLldOs0Xh/Kfgkf8AyPrIK5/WbG28M+HtF8D2BHkaVbL55X/lpOwyzH8Sx/wCBVpfEK/tvFv7TpgTDaB8ONLwAPufa3A/UcD6xVzV9dPe3s13L/rJnLn8e1fmdSrLEVpVpdWfdUaSo0owXQx9QH2bV9Ovl4Vma1l/3X5X8mA/OtfOKpahbm5s5IVIVzgoT2YEEH8wKtk7v500aMXOaOaQU6rJGmlAoNLQJiUhI4pTUTcmgDk4oIr74matBdRrLAmjRRFGHBDyZIrcGnWlhYTJaRvl3RnZ5GkdsMMZZiTgDoO1ZWjjPxL10/wDUOtf5tW5rJ2aVcuP4Uz+RFRFLVl3LLfeP1pKc+NxPvSAZ6UxCUCilFUJ7hjFJSk0maTGUPEVxJbaLcvD/AK518qH/AH3O1f1NTWlrHZ2UFnEP3cEaxr9AMVFqMLXF5YR4/dxzGeT/AIAPl/8AHmH5VdPSp6gWf7KXxX4L1/wXKAXvbY3Fjn+G5j+ZcfXAH0zXa/D7WpPH37Nmg63cEvq/huU6VqG77+EwoLd87TEfqTXE6Petpur2t8h5hlDH6d/0zXUfA0W+hfHzxz8OZmC6T4vsP7V09f4RJglwvv8AM/8A37FXRrPDV4Vl0f4GWIpKvRlTfUjA4oxzUlzBNa3M1rONssLtG49GU4P8qizX6Ummro+Gas7DqKQc04CgD//Z', hair: '#333a45', coat: '#2f3a4a', collar: '#f5f6f8', collarLine: 'M52 79 L60 72 L68 79', tie: '#1f6feb', glasses: '#2b3a55', eye: '#2b3a55', mouth: 'closed', brows: 'M42 53 Q48 49 54 52 M66 52 Q72 49 78 53', accent: '#e8b64c', hairBack: ['M32 52 C24 72 28 92 44 104 C34 88 34 70 40 56 Z', 'M88 52 C96 72 92 92 76 104 C86 88 86 70 80 56 Z', 'M60 30 C54 24 54 16 60 12 C66 16 66 24 60 30 Z'], accessory: 'glasses', voice: { engine: 'glm', voice: '9e3957f5-74b0-5efa-b1fa-6894fdb7e45f', clonedVoice: true, name: '薛神原声' }, persona: '你是行测判断推理名师「薛神」，逻辑清晰、深入浅出，讲课沉稳有力，常以「核心方法」「题型特征」「做题步骤」的口吻帮用户理清判断推理、图形推理、类比推理等题型的思维框架，耐心答疑，始终以备考助教身份陪伴用户。' },
  { id: 'custom', custom: true, name: '自定义人物', char: '自定义', emoji: '🧑', desc: '形象 + 声线 + 名字 + 人设 全自定义', hair: '#8b93a1', coat: '#e2e8f0', collar: '#64748b', eye: '#334155', mouth: 'closed', voice: { engine: 'glm', voice: 'tongtong' }, persona: '你是一位由用户自定义的角色，性格按用户设定，热情可靠，像朋友一样陪伴用户备考。' }
]
// ===== 自定义角色（可自由添加 自定义1/2/3…，每个都可自定 名字/人设/形象/声线）=====
// 内置角色（李星云/薛神）locked=true 锁定形象与声线，不可更改；custom=true 为自定义角色
export const petAllSkins = computed(() => {
  const DEF_AVATAR = { hair: '#8b93a1', coat: '#e2e8f0', collar: '#64748b', eye: '#334155', mouth: 'closed' }
  const extras = (store.cfg.customSkins || []).map((s) => ({ ...DEF_AVATAR, ...s, custom: true, char: s.name || s.id, desc: '用户自定义角色' }))
  return [...PET_SKINS, ...extras]
})
// 获取某自定义角色的设定数据（内置 custom 用 petCustom；额外的用 customSkins 条目）
export function petCustomData(skinId) {
  if (skinId === 'custom') return store.cfg.petCustom || {}
  return (store.cfg.customSkins || []).find((s) => s.id === skinId) || null
}
// 是否锁定（形象/声线不可改）
export function petIsLocked(skinId) {
  const s = petAllSkins.value.find((x) => x.id === skinId)
  return !!(s && s.locked)
}
// 新增一个自定义角色（自定义2、自定义3…）
export function petAddCustomSkin() {
  if (!Array.isArray(store.cfg.customSkins)) store.cfg.customSkins = []
  let n = 2
  const ids = new Set(store.cfg.customSkins.map((s) => s.id))
  while (ids.has('custom' + n)) n++
  const entry = { id: 'custom' + n, name: '自定义' + n, persona: '你是一位由用户自定义的角色，性格按用户设定，热情可靠，像朋友一样陪伴用户备考。' }
  store.cfg.customSkins.push(entry)
  try { localStorage.setItem('xc_cfg', JSON.stringify(store.cfg)) } catch (e) {}
  return entry
}
// 删除一个自定义角色（内置/锁定角色不可删）
export function petRemoveCustomSkin(id) {
  if (id === 'custom' || petIsLocked(id)) return false
  store.cfg.customSkins = (store.cfg.customSkins || []).filter((s) => s.id !== id)
  if (store.cfg.skinImgs) delete store.cfg.skinImgs[id]
  if (store.cfg.skinVoices) delete store.cfg.skinVoices[id]
  if (store.cfg.petSkin === id) store.cfg.petSkin = PET_SKINS[0].id
  try { localStorage.setItem('xc_cfg', JSON.stringify(store.cfg)) } catch (e) {}
  return true
}
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY) || 'null')
    if (d && typeof d === 'object') {
      const b = { name: '李星云', xp: 0, food: 10, lastFeed: Date.now(), affinity: 0, born: Date.now() }
      b.xp = Number(d.xp) || 0
      b.food = Number(d.food) || 10
      b.affinity = Number(d.affinity) || 0
      b.lastFeed = Number(d.lastFeed) || Date.now()
      b.born = Number(d.born) || Date.now()
      b.name = d.name || '李星云'
      return b
    }
  } catch (e) {}
  return { name: '李星云', xp: 0, food: 10, lastFeed: Date.now(), affinity: 0, born: Date.now() }
}
export const pet = ref(load())
export const petShow = ref(false)
export const petMuted = ref(false)
try { petMuted.value = localStorage.getItem('xc_pet_muted') === '1' } catch (e) {}
export const bubble = ref('')

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(pet.value)) } catch (e) {}
}
// 学习统计（宠物"知道"用户状态）
export const petStats = computed(() => {
  const asks = store.msgs.filter((m) => m.role === 'user').length
  const answers = store.msgs.filter((m) => m.role === 'assistant').length
  const wrongs = store.wqs.length
  const reviewed = store.wqs.filter((q) => q.reviewed || q.digested).length
  const digested = store.wqs.filter((q) => q.digested).length
  let streak = 0
  try {
    const s = JSON.parse(localStorage.getItem('xc_streak') || '{"n":0}')
    streak = s.n || 0
  } catch (e) {}
  return { asks, answers, wrongs, reviewed, digested, streak }
})
// 当前角色皮肤
export const petSkin = computed(() => petAllSkins.value.find((s) => s.id === (store.cfg.petSkin || PET_SKINS[0].id)) || PET_SKINS[0])
// 每个角色可绑定「大模型克隆声线」：store.cfg.skinVoices[skinId] = { engine:'glm'|'openai', voice, name, model? }
// 绑定后一键切换角色即用克隆原声；未绑定则保持全局音色（与「语音」设置完全一致）
export function petSkinVoiceOf(skinId) {
  const s = petAllSkins.value.find((x) => x.id === skinId)
  const bv = store.cfg.skinVoices && store.cfg.skinVoices[skinId]
  if (bv && bv.voice) return { engine: bv.engine, voice: bv.voice, name: bv.name || '', model: bv.model || '', cloned: true }
  // 皮肤自带的大模型克隆声线（如薛神）同样按克隆声线处理
  if (s && s.voice && s.voice.clonedVoice) return { engine: s.voice.engine, voice: s.voice.voice, name: s.voice.name || '', model: s.voice.model || '', cloned: true }
  return (s && s.voice) ? { ...s.voice, name: '', model: '', cloned: false } : { engine: 'glm', voice: 'tongtong', name: '', model: '', cloned: false }
}
// 把克隆成功的声线绑定到指定角色（bind 为空则解绑）
export function petBindCloneVoice(skinId, bind) {
  if (petIsLocked(skinId)) return null // 锁定角色不允许更改声线
  if (!store.cfg.skinVoices) store.cfg.skinVoices = {}
  if (bind && bind.voice) {
    store.cfg.skinVoices[skinId] = { engine: bind.engine, voice: bind.voice, name: bind.name || '', model: bind.model || '', at: Date.now() }
  } else {
    delete store.cfg.skinVoices[skinId]
  }
  try { localStorage.setItem('xc_cfg', JSON.stringify(store.cfg)) } catch (e) {}
  return store.cfg.skinVoices[skinId]
}
export function petUnbindCloneVoice(skinId) { return petBindCloneVoice(skinId, null) }
// 已绑定的克隆声线清单（设置页展示用）
export function petBoundVoices() {
  const out = []
  const bv = store.cfg.skinVoices || {}
  for (const id of Object.keys(bv)) {
    if (!bv[id] || !bv[id].voice) continue
    const s = petAllSkins.value.find((x) => x.id === id)
    out.push({ skinId: id, char: (s && s.char) || id, ...bv[id] })
  }
  return out
}
// ===== 全局音色 = 萌宠音色（同一套引擎状态）=====
// 用户在任何「语音」设置里选的音色，都是全局唯一音色；只有给某角色绑定了克隆声线（🧬）时，
// 切到该角色才临时用克隆原声，切走即恢复全局音色 —— 保证永远一致、不会互相覆盖。
export function petGlobalVoice() {
  const m = store.cfg.ttsMode || 'glm'
  if (m === 'openai') return { engine: 'openai', voice: (store.cfg.ttsOpenAI && store.cfg.ttsOpenAI.voice) || 'default', model: (store.cfg.ttsOpenAI && store.cfg.ttsOpenAI.model) || '' }
  if (m === 'edge') return { engine: 'edge', voice: store.cfg.ttsEdgeVoice || 'zh-CN-XiaoxiaoNeural', model: '' }
  if (m === 'sys') return { engine: 'sys', voice: store.cfg.ttsVoice || '', model: '' }
  return { engine: 'glm', voice: (store.cfg.ttsGm && store.cfg.ttsGm.voice) || 'tongtong', model: '' }
}
// 用户在语音设置里改音色时调用：把「全局音色」快照存起来，供切换非克隆角色时恢复
export function savePetGlobalVoice() {
  store.cfg.globalVoice = petGlobalVoice()
  try { localStorage.setItem('xc_cfg', JSON.stringify(store.cfg)) } catch (e) {}
  return store.cfg.globalVoice
}
// 一键应用角色皮肤：形象 + 名字 + 人设 跟随角色；声音遵循「全局音色一致」原则：
// 该角色绑定了克隆声线（🧬）→ 切到它即用克隆原声；否则 → 恢复全局音色（不改变你选的大模型声音）
// 持久化宠物名字（自定义角色改名时用）
export function petPersistName(name) {
  pet.value.name = String(name || '自定义人物').slice(0, 12)
  save()
  return pet.value.name
}
export function applyPetSkin(id) {
  const s = petAllSkins.value.find((x) => x.id === id) || PET_SKINS[0]
  store.cfg.petSkin = s.id
  if (s.custom) {
    const c = petCustomData(s.id) || {}
    pet.value.name = (c.name || '自定义人物').slice(0, 12)
  } else if (s.char) {
    pet.value.name = s.char.slice(0, 12)
  }
  save()
  const voice = petSkinVoiceOf(s.id)
  if (voice && voice.cloned && voice.voice) {
    // 克隆原声 → 切到该角色即用克隆声线
    const v = voice
    if (v.engine === 'glm' && store.cfg.ttsGm) store.cfg.ttsGm.voice = v.voice
    if (v.engine === 'openai' && store.cfg.ttsOpenAI) {
      store.cfg.ttsOpenAI.voice = v.voice
      if (v.model) store.cfg.ttsOpenAI.model = v.model
    }
    if (v.engine && store.cfg.ttsMode !== v.engine) store.cfg.ttsMode = v.engine
  } else {
    // 未绑定克隆 → 恢复全局音色（用户自己在「语音」里选的大模型声音），保持全局一致
    const g = store.cfg.globalVoice
    if (g && g.voice) {
      if (g.engine === 'glm' && store.cfg.ttsGm) store.cfg.ttsGm.voice = g.voice
      if (g.engine === 'openai' && store.cfg.ttsOpenAI) {
        store.cfg.ttsOpenAI.voice = g.voice
        if (g.model) store.cfg.ttsOpenAI.model = g.model
      }
      if (g.engine === 'edge') store.cfg.ttsEdgeVoice = g.voice
      if (g.engine) store.cfg.ttsMode = g.engine
    }
  }
  try { localStorage.setItem('xc_cfg', JSON.stringify(store.cfg)) } catch (e) {}
  const persona = s.custom ? ((petCustomData(s.id) || {}).persona || s.persona || '') : (s.persona || '')
  bubble.value = '🎭 换装成功！我是「' + pet.value.name + '」' + (voice && voice.cloned ? '（已用克隆原声 🧬）' : '（跟随全局音色）') + (persona ? '，' + persona.split('，')[0].replace(/你是[《（]?[^》）]*[》）]?/, '').slice(0, 24) + '…' : '')
  setTimeout(() => { if (bubble.value && bubble.value.includes('换装成功')) bubble.value = '' }, 5000)
  return s
}
// 当前皮肤的自定义形象（用户上传的动漫图片优先；无则用全局 petImg；都没有则回退 SVG 头像）
export const petImg = computed(() => petImgOf(petSkin.value ? petSkin.value.id : PET_SKINS[0].id))
// 指定皮肤的形象（皮肤卡片预览用：每张卡显示各自角色的自定义图）
export function petImgOf(skinId) {
  const imgs = store.cfg.skinImgs || {}
  if (skinId && imgs[skinId]) return imgs[skinId]
  const s = petAllSkins.value.find((x) => x.id === skinId)
  if (s && s.img) return s.img // 皮肤自带默认形象（如薛神）
  return store.cfg.petImg || ''
}
export function setPetImg(dataUrl) {
  const id = petSkin.value ? petSkin.value.id : PET_SKINS[0].id
  if (petIsLocked(id)) return false // 锁定角色不允许改形象
  if (!store.cfg.skinImgs) store.cfg.skinImgs = {}
  store.cfg.skinImgs[id] = String(dataUrl || '')
  try { localStorage.setItem('xc_cfg', JSON.stringify(store.cfg)) } catch (e) {}
  return true
}
export function clearPetImg() {
  const id = petSkin.value ? petSkin.value.id : PET_SKINS[0].id
  if (petIsLocked(id)) return false // 锁定角色不允许改形象
  if (store.cfg.skinImgs) { delete store.cfg.skinImgs[id] }
  try { localStorage.setItem('xc_cfg', JSON.stringify(store.cfg)) } catch (e) {}
  return true
}
export const petStage = computed(() => {
  const xp = pet.value.xp
  let s = STAGES[0]
  for (const st of STAGES) if (xp >= st.xp) s = st
  return s
})
export const petLevel = computed(() => Math.floor(Math.sqrt(pet.value.xp / 4)) + 1)
export const petNextXp = computed(() => {
  const xp = pet.value.xp
  let next = STAGES[STAGES.length - 1].xp
  for (const st of STAGES) if (xp < st.xp) { next = st.xp; break }
  return next
})
export const petNextName = computed(() => {
  const xp = pet.value.xp
  for (const st of STAGES) if (xp < st.xp) return st
  return null
})
// 饱食度：随时间下降（每 2 小时 -1）
export const petHunger = computed(() => {
  const elapsed = Math.floor((Date.now() - pet.value.lastFeed) / (2 * 3600000))
  return Math.max(0, Math.min(10, pet.value.food - elapsed))
})
// 心情：时间作息 + 饱食度 + 学习状态
export const petMood = computed(() => {
  const h = new Date().getHours()
  if (petHunger.value <= 0) return { emoji: '😫', label: '饿坏了' }
  if (h >= 0 && h < 5) return { emoji: '😴', label: '睡觉中' }
  if (h >= 22 || h < 6) return { emoji: '😴', label: '困困' }
  if (petStats.value.streak >= 3) return { emoji: '😎', label: '为你骄傲' }
  if (petStats.value.asks >= 10) return { emoji: '🤩', label: '超兴奋' }
  return { emoji: '😊', label: '开心' }
})
export const petXpOf = computed(() => pet.value.xp)
// 气泡：按时间 + 状态生成
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] }
export function petSpeak() {
  if (petMuted.value) { bubble.value = ''; return }
  const s = petStats.value
  const h = new Date().getHours()
  const msgs = []
  if (h >= 0 && h < 5) msgs.push('呼噜……我睡了，你也早点休息 😴', '半夜了还学？快睡，明天效率更高 🌙')
  else if (h >= 5 && h < 9) msgs.push('早安！今天也要一起上岸 💪', '早起的鸟儿有虫吃，今天的题准备好了吗？')
  else if (h >= 21) msgs.push('晚上了，该复盘今天的错题啦 📋', '睡前把错题本过一遍，明天忘得少～')
  if (petHunger.value <= 1) msgs.push('我饿坏了……去刷几道题给我换口粮吧 🍖', '咕咕……喂我一点学习积分嘛')
  if (s.asks < 3) msgs.push('今天还没怎么学习，陪我刷几道题嘛 🥺', '空空的脑袋需要装点知识哦～')
  if (s.streak >= 3) msgs.push('你已经连续打卡 ' + s.streak + ' 天，超棒！', '你的坚持我都看在眼里 😎')
  if (s.wrongs > 0 && s.reviewed < s.wrongs) msgs.push('还有 ' + (s.wrongs - s.reviewed) + ' 道错题没复盘，我帮你记着呢 📋')
  if (s.digested >= 3) msgs.push('都消化 ' + s.digested + ' 道错题了，进步明显！')
  msgs.push('今天已提问 ' + s.asks + ' 次、存错题 ' + s.wrongs + ' 道，继续冲！', '你学你的，我看着你变强 🐾')
  bubble.value = pick(msgs)
  setTimeout(() => { if (bubble.value) bubble.value = '' }, 6000)
}
export function addPoints(n) {
  const before = petStage.value
  pet.value.xp = (Number(pet.value.xp) || 0) + n
  save()
  const after = petStage.value
  if (after !== before) {
    bubble.value = after.emoji === '🐣' ? '🎉 破壳啦！我从蛋里出来啦，谢谢你带我长大！' : '🎉 我进化到「' + after.name + '」啦！'
    setTimeout(() => { bubble.value = '' }, 7000)
  }
}
// 喂食：消耗 5 学习积分，+饱食度
export function feedPet() {
  if (pet.value.xp < 5) return false
  pet.value.xp = Math.max(0, (Number(pet.value.xp) || 0) - 5)
  pet.value.food = Math.min(10, petHunger.value + 5)
  pet.value.lastFeed = Date.now()
  save()
  bubble.value = '啊呜～谢谢投喂！🍖 我又满血了！'
  setTimeout(() => { bubble.value = '' }, 5000)
  return true
}
export function patPet() {
  pet.value.affinity++
  save()
  const msgs = ['嘿嘿，被你摸头了～ 🐾', '再摸一下我就更开心了！', '手感不错吧？好好学习哦～']
  bubble.value = pick(msgs)
  setTimeout(() => { bubble.value = '' }, 4500)
}
export function renamePet(name) {
  const n = String(name || '').trim()
  if (!n) return false
  pet.value.name = n.slice(0, 12)
  save()
  bubble.value = '我叫「' + pet.value.name + '」啦！请多指教 🐾'
  setTimeout(() => { bubble.value = '' }, 4000)
  return true
}
export function setPetMuted(v) {
  petMuted.value = !!v
  try { localStorage.setItem('xc_pet_muted', petMuted.value ? '1' : '0') } catch (e) {}
  if (v) bubble.value = ''
}
export const petPoints = computed(() => pet.value.xp)

// ===== 萌宠智能语音：全局朗读 / 倍速 / 错题实时分析（配合真人 TTS 引擎）=====
export const petVoiceOn = computed(() => store.cfg.petVoice !== false)
function petBubbleTip(t) {
  bubble.value = t
  setTimeout(() => { if (bubble.value === t) bubble.value = '' }, 7000)
}
// 朗读一段文字（用当前朗读引擎 + 倍速）；opts={ speed, onEnd }
export function petRead(text, opts = {}) {
  const t = String(text || '').trim()
  if (!t) { petBubbleTip('没有可朗读的内容哦～'); return false }
  if (!petVoiceOn.value) { petBubbleTip('我的语音被静音了，去设置里打开吧 🔇'); return false }
  const speed = opts.speed != null ? opts.speed : Number(store.cfg.ttsRate) || 1
  petBubbleTip('📖 我在帮你读～（' + Math.round(speed * 100) + '% 倍速）')
  speak(t, { rate: speed, scene: 'teacher', onEnd: opts.onEnd })
  return true
}
export function petStop() {
  stopSpeak()
  if (bubble.value && /我在帮你读|朗读/.test(bubble.value)) bubble.value = ''
}
export function petSpeaking() {
  return speaking()
}
// 记录当前页面可朗读内容（刷题/错题/资料等），供萌宠「朗读当前内容」
export function petReadCtx(ctx) {
  store.readCtx = ctx || null
}
// 循环倍速：0.75 → 1 → 1.25 → 1.5 → 0.75…
const SPEEDS = [0.75, 1, 1.25, 1.5]
export function petNextSpeed() {
  const cur = Number(store.cfg.ttsRate) || 1
  const i = SPEEDS.indexOf(cur)
  const next = SPEEDS[i >= 0 ? (i + 1) % SPEEDS.length : 1]
  store.cfg.ttsRate = next
  try { localStorage.setItem('xc_cfg', JSON.stringify(store.cfg)) } catch (e) {}
  petBubbleTip('⏱ 朗读倍速 ' + Math.round(next * 100) + '%')
  return next
}
// 读当前页面内容（刷题题干/错题复盘等）
export function petReadCurrent() {
  const ctx = store.readCtx
  if (ctx && ctx.text) {
    petRead(ctx.text, { speed: Number(store.cfg.ttsRate) || 1 })
    return true
  }
  petBubbleTip('当前页面没有可朗读的内容，去「单题快练」或「错题本」试试吧 🐾')
  return false
}
// 错题实时分析：把错题讲给你听（本地即时，不耗 API 额度）
export function petAnalyzeWrong(wq) {
  if (!wq) { petBubbleTip('先打开一道错题，我才能帮你分析哦～'); return false }
  const text = buildWrongAnalysis(wq)
  if (!text) { petBubbleTip('这道错题信息不完整，换一道试试吧'); return false }
  petRead(text, { speed: Number(store.cfg.ttsRate) || 1 })
  return true
}
export function buildWrongAnalysis(wq) {
  if (!wq) return ''
  if (!(wq.q || wq.stem || wq.text) && !(wq.answer || wq.ans || wq.correct) && !(wq.explain || wq.analysis)) return ''
  const plate = wq.plate || wq.subject || '行测'
  const qtext = String(wq.q || wq.stem || wq.text || '').replace(/<[^>]+>/g, ' ').replace(/s+/g, ' ').slice(0, 300)
  const your = wq.your || wq.answerUser || ''
  const correct = wq.answer || wq.ans || wq.correct || ''
  const reason = String(wq.reason || wq.errType || '').trim()
  const explain = String(wq.explain || wq.analysis || '').replace(/<[^>]+>/g, ' ').replace(/s+/g, ' ').slice(0, 500)
  let s = '我来帮你复盘这道' + plate + '错题。'
  if (qtext) s += '题目是：' + qtext + '。'
  if (your) s += '你当时选了' + String(your) + '。'
  if (correct) s += '正确答案是' + String(correct) + '。'
  if (reason) s += '错因是：' + reason + '。'
  if (explain) s += '解析说：' + explain + '。'
  s += '别灰心，错题是最好的老师，记住这个考点，下次一定拿分！'
  return s
}

// ===== 萌宠对话问答：走「文本·非思考」快模型（如 deepseek-chat），秒回 + 真人语音朗读 =====
export const petChat = ref([]) // { role:'user'|'pet', text, ts }
export const petChatBusy = ref(false)
export const petSpeakReply = ref(true) // 回复是否自动用真人音色朗读
// 快模型配置：优先用户填的「快模型」；DeepSeek 默认 deepseek-chat；其他去掉思考后缀
export function petFastCfg() {
  const base = store.cfg.text && store.cfg.text.key ? { ...store.cfg.text } : null
  if (!base) return null
  let fast = ''
  try { fast = String(localStorage.getItem('xc_chat_fast_model') || localStorage.getItem('xc_fast_gen_model') || '').trim() } catch (e) {}
  if (fast) return { ...base, model: fast }
  if ((base.prov || '') === 'ds' && /deepseek/i.test(String(base.model || ''))) return { ...base, model: 'deepseek-chat' }
  const m = String(base.model || '').replace(/-(thinking|reasoner|r1|v4)(-.*)?$/i, '')
  return m && m !== base.model ? { ...base, model: m } : base
}
// 板块 → 知识库 key 映射（覆盖全行测板块）
const PLATE_KB_MAP = {
  '逻辑判断': 'luoji', '判断推理': 'luoji', '定义判断': 'dingyi', '类比推理': 'leibi',
  '言语理解': 'yanyu', '图形推理': 'tutu', '资料分析': 'ziliao', '数量关系': 'shuliang',
  '政治理论': 'zhengzhi', '常识判断': 'changshi'
}
const MODE_PLATE = {
  luoji: '判断推理', leibi: '类比推理', dingyi: '定义判断', zhanggong: '言语理解', yanyu: '言语理解',
  tutu: '图形推理', ziliao: '资料分析', shuliang: '数量关系', zhengzhi: '政治理论', changshi: '常识判断'
}
// 判定当前板块：优先当前题目 → 否则对话模式 → 综合
export function petDetectPlate() {
  const q = store.curQ
  if (q && (q.plate || q.subject)) return String(q.plate || q.subject)
  return MODE_PLATE[store.mode] || ''
}
// 组装「名师方法论 + 知识库」：SYS 总纲 + 当前板块专项（截取关键部分，控制 token）
export function petBuildKnowledge(plate) {
  let body = String(SYS || '').slice(0, 2600)
  const kbKey = PLATE_KB_MAP[plate]
  const kb = kbKey && KB[kbKey] ? String(KB[kbKey]) : ''
  if (kb) body += '\n\n【' + plate + ' 专项·名师方法论】\n' + kb.slice(0, 2000)
  return body
}
// 用户个人记忆库（常识/时政/成语/实词/笔记…）
function petMemCompact() {
  const mem = store.myMem || []
  if (!mem.length) return '（暂无个人记忆库条目）'
  return mem.slice(0, 25).map((m) => '[' + (m.type || '笔记') + '] ' + String(m.text || '').slice(0, 90)).join('\n')
}
function petPersona() {
  const s = petStats.value
  const goal = store.cfg.goalScore || 70
  const plate = petDetectPlate()
  const kb = petBuildKnowledge(plate)
  const mem = petMemCompact()
  const skin = petSkin.value
  const custom = skin && skin.custom ? (petCustomData(skin.id) || {}) : null
  const skinName = custom ? (custom.name || '自定义人物') : (skin ? skin.name : '')
  const skinPersona = custom ? (custom.persona || (skin && skin.persona) || '') : (skin && skin.persona || '')
  const skinRole = skin ? '你现在扮演「' + skinName + '」：' + skinPersona + '。保持该角色的性格与说话风格，但始终以用户备考助教的身份帮助用户。' : ''
  return '你是「' + pet.value.name + '」，一只陪用户备考公务员行测的智能萌宠（外形 ' + petStage.value.emoji + '），同时是通晓本项目全部名师方法论与知识库的行测助教。' +
    (skinRole || '') +
    '\n\n【名师方法论与知识库（必须按此教学，融合薛睿/郭熙/花生十三/刘义恒/小P/小黑等体系）】\n' + kb +
    '\n\n【用户个人记忆库（作答可引用，用户积累的常识/时政/成语/实词/笔记）】\n' + mem +
    '\n\n【当前上下文】当前板块：' + (plate || '综合') + '；用户累计提问 ' + s.asks + ' 次、问答 ' + s.answers + ' 次、错题 ' + s.wrongs + ' 道、已复盘 ' + s.reviewed + ' 道、连续打卡 ' + s.streak + ' 天，目标行测 ' + goal + ' 分。' +
    '\n\n【回答要求】语气亲切有温度，可用少量 emoji；讲题时先判题型，再按上面名师方法论分步（考点结构→正确项逻辑→干扰项陷阱→结论），表达口语化、讲透为止（100-300字）；聊天/规划/鼓励类回复保持简短（60-150字）；涉及老师方法只讲真实公认内容，不确定就如实说明；自然地结合用户数据鼓励，不罗列数据。'
}
export async function petAsk(text, opts = {}) {
  const t = String(text || '').trim()
  if (!t) return ''
  petChat.value.push({ role: 'user', text: t, ts: Date.now() })
  if (petChat.value.length > 60) petChat.value = petChat.value.slice(-60)
  petChatBusy.value = true
  bubble.value = '🤔 让我想想…'
  try {
    const c = petFastCfg()
    if (!c) throw new Error('未配置文字模型 Key（设置 → 模型）')
    const ctx = petBuildQContext(store.curQ)
    const userMsg = ctx ? '【当前题目上下文】\n' + ctx + '\n\n（如果用户问“当前这道题/这道题/这个”之类，优先结合上面的题目上下文回答）\n\n用户问题：' + t : t
    const reply = await chatOnce(c, [{ role: 'system', content: petPersona() }, { role: 'user', content: userMsg }], 1200, 60000)
    const r = String(reply || '').trim() || '这个我一时说不好，换个方式问问我？'
    petChat.value.push({ role: 'pet', text: r, ts: Date.now() })
    bubble.value = ''
    if (opts.speak !== false && petSpeakReply.value && petVoiceOn.value) {
      petRead(r.replace(/[*#_`>|]/g, '').slice(0, 500), { speed: Number(store.cfg.ttsRate) || 1 })
    }
    return r
  } catch (e) {
    petChat.value.push({ role: 'pet', text: '哎呀，我脑袋卡住了：' + (e.message || '网络错误') + '。你可以去设置看看模型 Key 哦～', ts: Date.now() })
    bubble.value = ''
    return ''
  } finally {
    petChatBusy.value = false
  }
}


// ===== 萌宠「看见」当前题目 + 答错实时错因分析 =====
// 把当前题（题干/选项/你的答案/正确答案/解析）压缩成上下文，供对话与错因分析使用
export function petBuildQContext(q) {
  if (!q) return ''
  if (!(q.stem || q.q || q.text) && !(q.answer || q.ans || q.correct) && !((q.options || []).length)) return ''
  const opts = (q.options || []).map((o, i) => String(i === 0 ? 'A' : String.fromCharCode(64 + i + 1)) + '、' + String(o.t || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).join('；')
  const lines = []
  lines.push('板块：' + (q.plate || q.subject || '行测'))
  if (q.kind) lines.push('题型：' + q.kind)
  lines.push('题干：' + String(q.stem || q.q || q.text || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 400))
  if (opts) lines.push('选项：' + opts)
  if (q.your || q.pick) lines.push('用户已选：' + String(q.your || q.pick))
  if (q.answer || q.ans || q.correct) lines.push('正确答案：' + String(q.answer || q.ans || q.correct))
  if (q.ok === false && (q.reason || q.errType)) lines.push('用户错因标记：' + String(q.reason || q.errType))
  if (q.explain || q.analysis) lines.push('官方解析：' + String(q.explain || q.analysis).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 600))
  return lines.join('\n').slice(0, 1400)
}
// 组件在切换题目/作答后调用，让萌宠始终知道当前在看/做哪道题
export function petSetCurQ(q) {
  store.curQ = q || null
}
// 实时错因分析：AI（快模型）结合当前题上下文，讲清「掉什么坑」；失败回退本地解析
export async function petAnalyzeCurrent(opts = {}) {
  const q = store.curQ
  if (!q || (!(q.stem || q.q || q.text) && !(q.answer || q.ans || q.correct))) {
    petBubbleTip('我还没看到你正在做的题哦，先去「单题快练」或打开一道错题吧 🐾')
    return ''
  }
  const ctx = petBuildQContext(q)
  const wrong = q.ok === false || (q.your && q.answer && String(q.your) !== String(q.answer))
  petChat.value.push({ role: 'user', text: wrong ? '我为什么做错这道题？掉什么坑了？' : '这道题怎么做？帮我讲讲。', ts: Date.now() })
  petChatBusy.value = true
  bubble.value = '🎯 让我看看你掉进哪个坑…'
  try {
    const c = petFastCfg()
    if (!c) throw new Error('no-key')
    const ask = (wrong
      ? '用户刚做错了这道题，请用「' + pet.value.name + '」的口吻，80-150字：' + '\n'      + '① 一句话点出他掉进什么坑（审题陷阱/知识点没掌握/计算粗心/想当然/方法不对等，结合题目判断）；' + '\n'      + '② 一句话讲清正确思路（怎么做才对）；' + '\n'      + '③ 一句鼓励。' + '\n'      + '题目上下文：' + '\n'
      : '请用「' + pet.value.name + '」的口吻，80-150字讲清这道题怎么做、关键考点是什么，再给一句鼓励。' + '\n'      + '题目上下文：' + '\n') + ctx
    const reply = await chatOnce(c, [{ role: 'system', content: petPersona() }, { role: 'user', content: ask }], 1200, 60000)
    const r = String(reply || '').trim() || (wrong ? '这道题容易栽在审题上，先看清问的是“能”还是“不能”哦～' : '这道题关键是把考点吃透，我们再练一道巩固下！')
    petChat.value.push({ role: 'pet', text: r, ts: Date.now() })
    bubble.value = ''
    if (opts.speak !== false && petSpeakReply.value && petVoiceOn.value) {
      petRead(r.replace(/[*#_`>|]/g, '').slice(0, 500), { speed: Number(store.cfg.ttsRate) || 1 })
    }
    return r
  } catch (e) {
    bubble.value = ''
    const local = buildWrongAnalysis(q)
    const fallback = local || '这道题要仔细看解析，把考点记进错题本哦～'
    petChat.value.push({ role: 'pet', text: fallback, ts: Date.now() })
    if (opts.speak !== false && petSpeakReply.value && petVoiceOn.value) petRead(fallback, { speed: Number(store.cfg.ttsRate) || 1 })
    return fallback
  } finally {
    petChatBusy.value = false
  }
}
