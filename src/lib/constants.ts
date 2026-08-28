import type { Server, Channel, Category } from "./types";

export const EMOJIS = ["😀","😂","❤️","🔥","👍","👎","🎉","💀","👀","⚡","✅","❌","🤖","👾"];
export const QUICK_REACTIONS = ["❤️","👍","😂"];

export const DECORATIONS: {id:string, label:string, url:string}[] = [
  {id:"none", label:"YOK", url:""},
  {id:"1", label:"Alev Kılıcı", url:"https://images.weserv.nl/?url=https%3A%2F%2Fcdn.discordapp.com%2Favatar-decoration-presets%2Fa_0f5d6c4dd8ae74662ee9c40722a56cbd.png%3Fsize%3D240%26passthrough%3Dtrue&w=280&h=280&fit=contain"},
  {id:"2", label:"Sakura", url:"https://images.weserv.nl/?url=https%3A%2F%2Fcdn.discordapp.com%2Favatar-decoration-presets%2Fa_e132d6014f2075d9fc2a8ece507ef5cf.png%3Fsize%3D240%26passthrough%3Dtrue&w=280&h=280&fit=contain"},
  {id:"3", label:"Kalp Çiçeği", url:"https://images.weserv.nl/?url=https%3A%2F%2Fcdn.discordapp.com%2Favatar-decoration-presets%2Fa_3e1fc3c7ee2e34e8176f4737427e8f4f.png%3Fsize%3D240%26passthrough%3Dtrue&w=280&h=280&fit=contain"},
  {id:"4", label:"Kelebekler", url:"https://images.weserv.nl/?url=https%3A%2F%2Fcdn.discordapp.com%2Favatar-decoration-presets%2Fa_4cd9ae5a8d103c219eacd3674d7730cd.png%3Fsize%3D240%26passthrough%3Dtrue&w=280&h=280&fit=contain"},
  {id:"5", label:"Taç", url:"https://images.weserv.nl/?url=https%3A%2F%2Fcdn.discordapp.com%2Favatar-decoration-presets%2Fa_88f42fb7360d8224a670a50c3496f315.png%3Fsize%3D240%26passthrough%3Dtrue&w=280&h=280&fit=contain"},
  {id:"6", label:"Defne", url:"https://images.weserv.nl/?url=https%3A%2F%2Fcdn.discordapp.com%2Favatar-decoration-presets%2Fa_8ad98d25ee4e4512704f759476eeb294.png%3Fsize%3D240%26passthrough%3Dtrue&w=280&h=280&fit=contain"},
  {id:"7", label:"Şimşek", url:"https://images.weserv.nl/?url=https%3A%2F%2Fcdn.discordapp.com%2Favatar-decoration-presets%2Fa_d8d93c7a53c0dd07a4074b745210434d.png%3Fsize%3D240%26passthrough%3Dtrue&w=280&h=280&fit=contain"},
  {id:"8", label:"Gece Büyücüsü", url:"https://images.weserv.nl/?url=https%3A%2F%2Fcdn.discordapp.com%2Favatar-decoration-presets%2Fa_4430a4ee89b7fba456e765db21f38485.png%3Fsize%3D240%26passthrough%3Dtrue&w=280&h=280&fit=contain"},
  {id:"9", label:"Filiz", url:"https://images.weserv.nl/?url=https%3A%2F%2Fcdn.discordapp.com%2Favatar-decoration-presets%2Fa_3012fad396abbf24e325431800b51510.png%3Fsize%3D240%26passthrough%3Dtrue&w=280&h=280&fit=contain"},
  {id:"10", label:"Lovestruck", url:"https://images.weserv.nl/?url=https%3A%2F%2Fcdn.discordapp.com%2Favatar-decoration-presets%2Fa_7f44d538ec830f479605f7bf8720afda.png%3Fsize%3D240%26passthrough%3Dtrue&w=280&h=280&fit=contain"},
  {id:"11", label:"Valorant", url:"https://images.weserv.nl/?url=https%3A%2F%2Fcdn.discordapp.com%2Favatar-decoration-presets%2Fa_90e0dce3cc48c4a9607b6d41209c737e.png%3Fsize%3D240%26passthrough%3Dtrue&w=280&h=280&fit=contain"},
  {id:"12", label:"Samuray", url:"https://images.weserv.nl/?url=https%3A%2F%2Fcdn.discordapp.com%2Favatar-decoration-presets%2Fa_57807030ab60f7ac0c4a1998aa091bbf.png%3Fsize%3D240%26passthrough%3Dtrue&w=280&h=280&fit=contain"},
];

export const PRONOUNS_LIST = ["he/him","she/her","they/them","he/they","she/they","they/them","it/its","any/all","ask me","he/him • tr","she/her • tr"];

export const fallbackServers: Server[] = [{ id:"demo", name:"AKAYROOM // DEMO", ownerId:"demo", createdAt:0 }];
export const fallbackChannels: Channel[] = [
  { id:"general", name:"genel", type:"text", position:0, topic:"genel sohbet" },
  { id:"voice", name:"sesli-oda", type:"voice", position:1 },
];
export const fallbackCats: Category[] = [{ id:"cat1", name:"KANALLAR", position:0 }];
