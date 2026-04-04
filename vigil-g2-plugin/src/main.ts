import {
  waitForEvenAppBridge,
  CreateStartUpPageContainer,
  TextContainerProperty,
} from '@evenrealities/even_hub_sdk'

async function init(): Promise<void> {
  const bridge = await waitForEvenAppBridge()

  const homeText = new TextContainerProperty({
    xPosition: 0,
    yPosition: 0,
    width: 576,
    height: 288,
    borderWidth: 0,
    borderColor: 0,
    borderRadius: 0,
    paddingLength: 8,
    containerID: 1,
    containerName: 'home',
    content: 'VIGIL\n━━━━━━━━━━━━━━━━━━━━\nConnecting...',
    isEventCapture: 1,
  })

  const container = new CreateStartUpPageContainer({
    containerTotalNum: 1,
    textObject: [homeText],
  })

  await bridge.createStartUpPageContainer(container)

  console.log('Vigil G2 plugin initialized')
}

init()
