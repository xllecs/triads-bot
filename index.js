import 'dotenv/config'

import { Client, GatewayIntentBits } from 'discord.js'

import { DynamoDBClient, GetItemCommand, PutItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb'

const TOKEN = process.env.BOT_TOKEN
const CHANNEL_ID = process.env.CHANNEL_ID
const USER_ID = process.env.USER_ID

const discordClient = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
})

const dynamoClient = new DynamoDBClient({})

const getTaxes = async (drug) => {
  const params = {
    TableName: "triads_taxes",
    Key: {
      "triads_pk": {
        "S": "0"
      }
    },
  }
  
  try {
    const data = await dynamoClient.send(new GetItemCommand(params))

    if (drug) {
      return data.Item[drug].N
    }

    return {
      'pcpTotal': data.Item.pcp_total.N,
      'weedTotal': data.Item.weed_total.N,
      'total': Number(data.Item.pcp_total.N) + Number(data.Item.weed_total.N)
    }
  } catch (error) {
    console.error("Error:", error)
  }
}

const updateTax = async (drug, tax) => {
  const field = drug === 'iarba' ? 'weed_total' : 'pcp_total'

  const currentTax = await getTaxes(field)

  const params = {
    TableName: "triads_taxes",
    Key: {
      "triads_pk": { "S": "0" },
    },
    UpdateExpression: `SET ${field} = :new_value`,
    ExpressionAttributeValues: {
      ":new_value": { "N": `${Number(currentTax) + Number(tax)}` },
    },
    ReturnValues: "UPDATED_NEW"
  }
  
  try {
    const data = await dynamoClient.send(new UpdateItemCommand(params))
    console.log('result: ' + JSON.stringify(data))
  } catch (error) {
    console.error("Error:", error)
  }
}

const resetTaxes = async () => {
  const params = {
    TableName: "triads_taxes",
    Item: {
      "triads_pk": {
        "S": "0"
      },
      "pcp_total": {
        "N": "0"
      },
      "weed_total": {
        "N": "0"
      }
    }
  }

  try {
    const response = await dynamoClient.send(new PutItemCommand(params))
    console.log('response: ' + JSON.stringify(response))
  } catch (error) {
    console.error("Error:", error)
  }
}

discordClient.on('ready', () => {
  console.log(`Logged in as ${discordClient.user.tag}`);
})

discordClient.on('messageCreate', async (message) => {
  if (message.author.bot) return
  if (message.channel.id !== CHANNEL_ID) return

  const [ cmd, playerId, tax, drug ] = message.content.split(' ')

  if (cmd === '!help') {
    message.reply(`
:cherry_blossom:  **\`!taxa <idPlayer> <suma> <locatie>\` • Inregistreaza o taxa**

Tine cont de urmatoarele:  
- \`idPlayer\` trebuie sa fie valid.  
- \`suma\` trebuie sa fie intre \`100000\` si \`300000\`.  
- \`locatie\` poate fi doar \`iarba\` sau \`pcp\`.  

Taxa va fi valabila **1 ora**; vei fi anuntat odata ce expira.  

:cherry_blossom:  **\`!suma\` • Vezi cat s-a strans pana acum din taxe**  

:cherry_blossom:  **\`!reset\` • Reseteaza taxele (doar <@516711193155469322> poate face asta deocamdata)**
    `)
    return
  }

  if (cmd === '!suma') {
    const { pcpTotal, weedTotal, total } = await getTaxes()
    message.reply(`
Suma totala acumulata pana acum este de **\$${total}**, dintre care:
- **\$${weedTotal}** de la campul de **iarba**.
- **\$${pcpTotal}** de la campul de **piperidina**.
    `)
    return
  }

  if (cmd === '!reset') {
    if (message.author.id === USER_ID) {
      resetTaxes()
      message.reply('Taxele au fost resetate.')
    } else {
      message.reply('N-ai voie.')
    }
    return
  }

  if (cmd !== '!taxa' && cmd !== '!suma' && cmd !== '!help') {
    message.reply(`
Comanda gresita. Poti folosi doar una din urmatoarele:
- \`!help\`
- \`!suma\`
- \`!taxa <idPlayer> <suma> <locatie>\`
    `)
    return
  }

  if (cmd === '!taxa') {
    if (message.content.split(' ').length != 4) {
      message.reply('Comanda gresita. Asigura-te ca ai dat toate datele necesare (`idPlayer`, `suma`, `locatie`).')
      return
    }
  }

  if (isNaN(playerId)) {
    message.reply('ID invalid.')
    return
  }

  if (isNaN(tax)) {
    message.reply('Suma invalida.')
    return
  }

  if (Number(tax) < 100000 || Number(tax) > 300000) {
    message.reply('Suma trebuie sa fie intre \`100000\` si \`300000\`.')
    return
  }

  if (drug.toLowerCase() !== 'iarba' && drug.toLowerCase() !== 'pcp') {
    message.reply('Locatie necunoscuta. Foloseste `iarba` sau `pcp`.')
    return
  }

  const location = drug === 'iarba' ? 'iarba' : 'piperidina' 

  message.reply(`Taxa de **\$${tax}** ridicata de la **#${playerId}** la campul de **${location}**. Te anunt intr-o ora cand trebuie sa ridici taxa din nou.`)
  updateTax(drug, tax)

  setTimeout(() => {
    message.channel.send(`${message.author}, mergi sa ridici taxa de la **\#${playerId}** la campul de **${location}**!`)
  }, 3600000)
})

discordClient.login(TOKEN)
