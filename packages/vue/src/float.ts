import {
  Transition,
  cloneVNode,
  computed,
  createCommentVNode,
  h,
  inject,
  mergeProps,
  nextTick,
  onMounted,
  provide,
  ref,
  shallowRef,
  toRef,
  watch,
  watchEffect,
} from 'vue'
import type { ComputedRef, FunctionalComponent, InjectionKey, PropType, Ref, SetupContext, ShallowRef, VNode } from 'vue'
import { Portal, TransitionChild } from '@headlessui/vue'
import { useFloating } from '@floating-ui/vue'
import { autoUpdate } from '@floating-ui/dom'
import type { DetectOverflowOptions, FloatingElement, Middleware, Placement, ReferenceElement, Strategy, VirtualElement } from '@floating-ui/dom'
import type { Options as OffsetOptions } from '@floating-ui/core/src/middleware/offset'
import type { Options as ShiftOptions } from '@floating-ui/core/src/middleware/shift'
import type { Options as FlipOptions } from '@floating-ui/core/src/middleware/flip'
import type { Options as AutoPlacementOptions } from '@floating-ui/core/src/middleware/autoPlacement'
import type { Options as HideOptions } from '@floating-ui/core/src/middleware/hide'
import type { Options as AutoUpdateOptions } from '@floating-ui/dom/src/autoUpdate'
import { dom } from './utils/dom'
import { env } from './utils/env'
import { flattenFragment, isValidElement, isVisibleDOMElement } from './utils/render'
import { type OriginClassResolver } from './origin-class-resolvers'
import { useFloatingMiddlewareFromProps } from './hooks/use-floating-middleware-from-props'
import { useReferenceElResizeObserver } from './hooks/use-reference-el-resize-observer'
import { useTransitionAndOriginClass } from './hooks/use-transition-and-origin-class'
import { useOutsideClick } from './hooks/use-outside-click'
import { useDocumentEvent } from './hooks/use-document-event'
import { getOwnerDocument } from './utils/owner'

interface ReferenceState {
  referenceRef: Ref<ReferenceElement | null>
  placement: Readonly<Ref<Placement>>
}

interface FloatingState {
  floatingRef: Ref<FloatingElement | null>
  props: FloatProps
  mounted: Ref<boolean>
  show: Ref<boolean>
  x: Readonly<Ref<number | null>>
  y: Readonly<Ref<number | null>>
  placement: Readonly<Ref<Placement>>
  strategy: Readonly<Ref<Strategy>>
  referenceElWidth: Ref<number | null>
  updateFloating: () => void
}

interface ArrowState {
  ref: Ref<HTMLElement | null>
  placement: Ref<Placement>
  x: Ref<number | undefined>
  y: Ref<number | undefined>
}

const ReferenceContext = Symbol('ReferenceContext') as InjectionKey<ReferenceState>
const FloatingContext = Symbol('FloatingContext') as InjectionKey<FloatingState>
const ArrowContext = Symbol('ArrowContext') as InjectionKey<ArrowState>

function useReferenceContext(component: string) {
  const context = inject(ReferenceContext, null)
  if (context === null) {
    const err = new Error(`<${component} /> must be in the <Float /> component.`)
    if (Error.captureStackTrace) Error.captureStackTrace(err, useReferenceContext)
    throw err
  }
  return context
}

function useFloatingContext(component: string) {
  const context = inject(FloatingContext, null)
  if (context === null) {
    const err = new Error(`<${component} /> must be in the <Float /> component.`)
    if (Error.captureStackTrace) Error.captureStackTrace(err, useFloatingContext)
    throw err
  }
  return context
}

function useArrowContext(component: string) {
  const context = inject(ArrowContext, null)
  if (context === null) {
    const err = new Error(`<${component} /> must be in the <Float /> component.`)
    if (Error.captureStackTrace) Error.captureStackTrace(err, useArrowContext)
    throw err
  }
  return context
}

export interface FloatProps {
  as?: string | FunctionalComponent
  floatingAs?: string | FunctionalComponent
  show?: boolean
  placement?: Placement
  strategy?: Strategy
  offset?: OffsetOptions
  shift?: boolean | number | Partial<ShiftOptions & DetectOverflowOptions>
  flip?: boolean | number | Partial<FlipOptions & DetectOverflowOptions>
  arrow?: boolean | number
  autoPlacement?: boolean | Partial<AutoPlacementOptions & DetectOverflowOptions>
  hide?: boolean | Partial<HideOptions & DetectOverflowOptions>
  autoUpdate?: boolean | Partial<AutoUpdateOptions>
  zIndex?: number | string
  transitionName?: string
  transitionType?: 'transition' | 'animation'
  enter?: string
  enterFrom?: string
  enterTo?: string
  leave?: string
  leaveFrom?: string
  leaveTo?: string
  originClass?: string | OriginClassResolver
  tailwindcssOriginClass?: boolean
  portal?: boolean
  transform?: boolean
  adaptiveWidth?: boolean
  composable?: boolean
  dialog?: boolean
  middleware?: Middleware[] | ((refs: {
    referenceEl: ComputedRef<ReferenceElement | null>
    floatingEl: ComputedRef<HTMLElement | null>
  }) => Middleware[])
  onShow?: () => any
  onHide?: () => any
  onUpdate?: () => any
}

export const FloatPropsValidators = {
  as: {
    type: [String, Function] as PropType<string | FunctionalComponent>,
    default: 'template',
  },
  floatingAs: {
    type: [String, Function] as PropType<string | FunctionalComponent>,
    default: 'div',
  },
  show: {
    type: Boolean,
    default: null,
  },
  placement: {
    type: String as PropType<Placement>,
    default: 'bottom-start',
  },
  strategy: {
    type: String as PropType<Strategy>,
    default: 'absolute',
  },
  offset: [Number, Function, Object] as PropType<OffsetOptions>,
  shift: {
    type: [Boolean, Number, Object] as PropType<boolean | number | Partial<ShiftOptions & DetectOverflowOptions>>,
    default: false,
  },
  flip: {
    type: [Boolean, Number, Object] as PropType<boolean | number | Partial<FlipOptions & DetectOverflowOptions>>,
    default: false,
  },
  arrow: {
    type: [Boolean, Number],
    default: false,
  },
  autoPlacement: {
    type: [Boolean, Object] as PropType<boolean | Partial<AutoPlacementOptions & DetectOverflowOptions>>,
    default: false,
  },
  hide: {
    type: [Boolean, Object] as PropType<boolean | Partial<HideOptions & DetectOverflowOptions>>,
    default: false,
  },
  autoUpdate: {
    type: [Boolean, Object] as PropType<boolean | Partial<AutoUpdateOptions>>,
    default: true,
  },
  zIndex: {
    type: [Number, String],
    default: 9999,
  },
  transitionName: String,
  transitionType: String as PropType<'transition' | 'animation'>,
  enter: String,
  enterFrom: String,
  enterTo: String,
  leave: String,
  leaveFrom: String,
  leaveTo: String,
  originClass: [String, Function] as PropType<string | OriginClassResolver>,
  tailwindcssOriginClass: {
    type: Boolean,
    default: false,
  },
  portal: {
    type: Boolean,
    default: false,
  },
  transform: {
    type: Boolean,
    default: true,
  },
  adaptiveWidth: {
    type: Boolean,
    default: false,
  },
  composable: {
    type: Boolean,
    default: false,
  },
  dialog: {
    type: Boolean,
    default: false,
  },
  middleware: {
    type: [Array, Function] as PropType<Middleware[] | ((refs: {
      referenceEl: ComputedRef<ReferenceElement | null>
      floatingEl: ComputedRef<FloatingElement | null>
    }) => Middleware[])>,
    default: () => [],
  },
}

export interface FloatSlotProps {
  placement: Placement
}

export type RenderReferenceElementProps = FloatReferenceProps & Required<Pick<FloatReferenceProps, 'as'>>

export function renderReferenceElement(
  referenceNode: VNode,
  componentProps: RenderReferenceElementProps,
  attrs: SetupContext['attrs'],
  context: ReferenceState
) {
  const { referenceRef } = context

  const props = componentProps

  const nodeProps = mergeProps(attrs, {
    ref: referenceRef,
  })

  const node = cloneVNode(
    referenceNode,
    props.as === 'template' ? nodeProps : {}
  )

  if (props.as === 'template') {
    return node
  } else if (typeof props.as === 'string') {
    return h(props.as, nodeProps, [node])
  }
  return h(props.as!, nodeProps, () => [node])
}

export type RenderFloatingElementProps =
  FloatContentProps &
  Required<Pick<FloatContentProps, 'as'>> &
  {
    show?: boolean | null
    enterActiveClassRef: ComputedRef<string | undefined>
    leaveActiveClassRef: ComputedRef<string | undefined>
  }

export function renderFloatingElement(
  floatingNode: VNode,
  componentProps: RenderFloatingElementProps,
  attrs: SetupContext['attrs'],
  context: FloatingState
) {
  const { floatingRef, props: rootProps, mounted, show, x, y, placement, strategy, referenceElWidth, updateFloating } = context

  const props = mergeProps(
    rootProps as Record<string, any>,
    componentProps as Record<string, any>
  ) as FloatProps & FloatContentProps

  const { enterActiveClassRef, leaveActiveClassRef } = componentProps

  const transitionClassesProps = {
    enterActiveClass: enterActiveClassRef.value,
    enterFromClass: props.enterFrom,
    enterToClass: props.enterTo,
    leaveActiveClass: leaveActiveClassRef.value,
    leaveFromClass: props.leaveFrom,
    leaveToClass: props.leaveTo,
  }

  const transitionProps = {
    name: props.transitionName,
    type: props.transitionType,
    appear: true,
    ...(!props.transitionName ? transitionClassesProps : {}),
    onBeforeEnter() {
      show.value = true
    },
    onAfterLeave() {
      show.value = false
    },
  }

  const transitionChildProps = {
    enter: enterActiveClassRef.value,
    enterFrom: props.enterFrom,
    enterTo: props.enterTo,
    leave: leaveActiveClassRef.value,
    leaveFrom: props.leaveFrom,
    leaveTo: props.leaveTo,
    onBeforeEnter: transitionProps.onBeforeEnter,
    onAfterLeave: transitionProps.onAfterLeave,
  }

  const floatingProps = {
    style: {
      // If enable dialog mode, then set `transform` to false.
      ...((props.dialog ? false : props.transform) ? {
        position: strategy.value,
        zIndex: props.zIndex,
        top: '0px',
        left: '0px',
        right: 'auto',
        bottom: 'auto',
        transform: `translate(${Math.round(x.value || 0)}px,${Math.round(y.value || 0)}px)`,
      } : {
        position: strategy.value,
        zIndex: props.zIndex,
        top: `${y.value || 0}px`,
        left: `${x.value || 0}px`,
      }),
      width: props.adaptiveWidth && typeof referenceElWidth.value === 'number'
        ? `${referenceElWidth.value}px`
        : undefined,
    },
  }

  function renderPortal(node: VNode) {
    if (props.portal) {
      return h(Portal, () => node)
    }
    return node
  }

  function renderFloating(node: VNode) {
    const nodeProps = mergeProps(
      floatingProps,
      attrs,
      !props.dialog ? { ref: floatingRef } : {}
    )

    if (props.as === 'template') {
      return node
    } else if (typeof props.as === 'string') {
      return h(props.as, nodeProps, node)
    }
    return h(props.as!, nodeProps, () => node)
  }

  function renderFloatingNode() {
    function createFloatingNode() {
      const contentProps = props.as === 'template'
        ? mergeProps(
          floatingProps,
          attrs,
          !props.dialog ? { ref: floatingRef } : {}
        )
        : null
      const el = cloneVNode(floatingNode, contentProps)

      if (el.props?.unmount === false) {
        updateFloating()
        return el
      }

      if (typeof props.show === 'boolean' ? props.show : true) {
        return el
      }

      return createCommentVNode()
    }

    if (env.isServer) {
      if (mounted.value && props.show) {
        return createFloatingNode()
      }
      return createCommentVNode()
    }

    if (props.transitionChild) {
      return h(TransitionChild, {
        key: `placement-${placement.value}`,
        ...(props.dialog ? { ref: floatingRef } : {}),
        as: 'template',
        ...transitionChildProps,
      }, createFloatingNode)
    }

    return h(Transition, {
      ...(props.dialog ? { ref: floatingRef } : {}),
      ...transitionProps,
    }, createFloatingNode)
  }

  return renderPortal(
    renderFloating(
      renderFloatingNode()
    )
  )
}

export function useFloat<T extends ReferenceElement>(
  show: Ref<boolean>,
  reference: Ref<T | null>,
  floating: Ref<FloatingElement | null>,
  props: FloatProps,
  emit: (event: 'show' | 'hide' | 'update', ...args: any[]) => void
) {
  const mounted = ref(false)

  const propPlacement = toRef(props, 'placement')
  const propStrategy = toRef(props, 'strategy')
  const middleware = shallowRef({}) as ShallowRef<Middleware[]>
  const arrowRef = ref(null) as Ref<HTMLElement | null>
  const arrowX = ref<number | undefined>(undefined)
  const arrowY = ref<number | undefined>(undefined)

  const referenceEl = computed(() => dom(reference)) as ComputedRef<T | null>
  const floatingEl = computed(() => dom(floating)) as ComputedRef<FloatingElement | null>

  const isVisible = computed(() =>
    isVisibleDOMElement(referenceEl) &&
    isVisibleDOMElement(floatingEl)
  )

  const { x, y, placement, strategy, middlewareData, update } = useFloating<T>(referenceEl, floatingEl, {
    placement: propPlacement,
    strategy: propStrategy,
    middleware,
    whileElementsMounted: () => {},
  })

  const referenceElWidth = ref<number | null>(null)

  const { enterActiveClassRef, leaveActiveClassRef } = useTransitionAndOriginClass(props, placement)

  onMounted(() => {
    mounted.value = true
  })

  function updateFloating() {
    if (isVisible.value) {
      update()
      emit('update')
    }
  }

  watch([propPlacement, propStrategy, middleware], updateFloating, { flush: 'sync' })

  useFloatingMiddlewareFromProps(
    middleware,
    referenceEl,
    floatingEl,
    arrowRef,
    props
  )

  watch(middlewareData, () => {
    const arrowData = middlewareData.value.arrow as { x?: number, y?: number }
    arrowX.value = arrowData?.x
    arrowY.value = arrowData?.y
  })

  useReferenceElResizeObserver(props.adaptiveWidth, referenceEl, referenceElWidth)

  watch(show, async (value, oldValue, onInvalidate) => {
    await nextTick()

    if (show.value && isVisible.value && props.autoUpdate) {
      const cleanup = autoUpdate(
        referenceEl.value!,
        floatingEl.value!,
        updateFloating,
        typeof props.autoUpdate === 'object'
          ? props.autoUpdate
          : undefined
      )
      emit('show')

      onInvalidate(() => {
        cleanup()
        if (!show.value)
          emit('hide')
      })
    }
  }, { flush: 'post', immediate: true })

  const needForRAF = ref(true)

  watch(referenceEl, () => {
    // only watch on the reference element is virtual element.
    if (!(referenceEl.value instanceof Element) && isVisible.value && needForRAF.value) {
      needForRAF.value = false
      window.requestAnimationFrame(() => {
        needForRAF.value = true
        updateFloating()
      })
    }
  }, { flush: 'sync' })

  const referenceApi: ReferenceState = {
    referenceRef: reference,
    placement,
  }

  const floatingApi: FloatingState = {
    floatingRef: floating,
    props,
    mounted,
    show,
    x,
    y,
    placement,
    strategy,
    referenceElWidth,
    updateFloating,
  }

  const arrowApi: ArrowState = {
    ref: arrowRef,
    placement,
    x: arrowX,
    y: arrowY,
  }

  provide(ArrowContext, arrowApi)

  return { referenceApi, floatingApi, arrowApi, x, y, placement, strategy, referenceEl, floatingEl, middlewareData, update: updateFloating, enterActiveClassRef, leaveActiveClassRef }
}

export const Float = {
  name: 'Float',
  inheritAttrs: false,
  props: FloatPropsValidators,
  emits: ['show', 'hide', 'update'],
  setup(props: FloatProps, { emit, slots, attrs }: SetupContext<['show', 'hide', 'update']>) {
    const show = ref(props.show ?? false)
    const reference = ref(null) as Ref<HTMLElement | null>
    const floating = ref(null) as Ref<HTMLElement | null>

    const {
      referenceApi,
      floatingApi,
      placement,
      enterActiveClassRef,
      leaveActiveClassRef,
    } = useFloat(show, reference, floating, props, emit)

    function renderWrapper(children: VNode[]) {
      if (props.as === 'template') {
        return children
      } else if (typeof props.as === 'string') {
        return h(props.as, attrs, children)
      }
      return h(props.as!, attrs, () => children)
    }

    const slot: FloatSlotProps = {
      placement: placement.value,
    }

    // If enable dialog mode, then set `composable` to true..
    if (props.composable || props.dialog) {
      provide(ReferenceContext, referenceApi)
      provide(FloatingContext, floatingApi)

      return () => {
        if (!slots.default) return

        return renderWrapper(slots.default(slot))
      }
    }

    return () => {
      if (!slots.default) return

      const [referenceNode, floatingNode] = flattenFragment(slots.default(slot)).filter(isValidElement)

      if (!isValidElement(referenceNode)) {
        return
      }

      const referenceElement = renderReferenceElement(
        referenceNode,
        { as: 'template' },
        {},
        referenceApi
      )

      const floatingElement = renderFloatingElement(
        floatingNode,
        {
          as: props.floatingAs!,
          enterActiveClassRef,
          leaveActiveClassRef,
        },
        {},
        floatingApi
      )

      return renderWrapper([
        referenceElement,
        floatingElement,
      ])
    }
  },
} as unknown as {
  new (): {
    $props: FloatProps
    $slots: {
      default(props: FloatSlotProps): any
    }
  }
}

export interface FloatReferenceProps extends Pick<FloatProps, 'as'> {}

export const FloatReferencePropsValidators = {
  as: FloatPropsValidators.as,
}

export interface FloatReferenceSlotProps {
  placement: Placement
}

export const FloatReference = {
  name: 'FloatReference',
  inheritAttrs: false,
  props: FloatReferencePropsValidators,
  setup(props: FloatReferenceProps, { slots, attrs }: SetupContext) {
    const context = useReferenceContext('FloatReference')
    const { placement } = context

    return () => {
      if (!slots.default) return

      const slot: FloatReferenceSlotProps = {
        placement: placement.value,
      }

      return renderReferenceElement(
        slots.default(slot)[0],
        props as Required<FloatReferenceProps>,
        attrs,
        context
      )
    }
  },
} as unknown as {
  new (): {
    $props: FloatReferenceProps
    $slots: {
      default(props: FloatReferenceSlotProps): any
    }
  }
}

export interface FloatContentProps extends Pick<FloatProps, 'as' | 'transitionName' | 'transitionType' | 'enter' | 'enterFrom' | 'enterTo' | 'leave' | 'leaveFrom' | 'leaveTo' | 'originClass' | 'tailwindcssOriginClass'> {
  transitionChild?: boolean
}

export const FloatContentPropsValidators = {
  as: FloatPropsValidators.as,
  transitionName: FloatPropsValidators.transitionName,
  transitionType: FloatPropsValidators.transitionType,
  enter: FloatPropsValidators.enter,
  enterFrom: FloatPropsValidators.enterFrom,
  enterTo: FloatPropsValidators.enterTo,
  leave: FloatPropsValidators.leave,
  leaveFrom: FloatPropsValidators.leaveFrom,
  leaveTo: FloatPropsValidators.leaveTo,
  originClass: FloatPropsValidators.originClass,
  tailwindcssOriginClass: FloatPropsValidators.tailwindcssOriginClass,
  transitionChild: {
    type: Boolean,
    default: false,
  },
}

export interface FloatContentSlotProps {
  placement: Placement
}

export const FloatContent = {
  name: 'FloatContent',
  inheritAttrs: false,
  props: FloatContentPropsValidators,
  setup(props: FloatContentProps, { slots, attrs }: SetupContext) {
    const context = useFloatingContext('FloatContent')
    const { placement } = context

    const { enterActiveClassRef, leaveActiveClassRef } = useTransitionAndOriginClass(props, placement)

    return () => {
      if (!slots.default) return

      const slot: FloatContentSlotProps = {
        placement: placement.value,
      }

      return renderFloatingElement(
        slots.default(slot)[0],
        {
          ...(props as Required<Pick<FloatContentProps, 'as'>> & FloatContentProps),
          enterActiveClassRef,
          leaveActiveClassRef,
        },
        attrs,
        context
      )
    }
  },
} as unknown as {
  new (): {
    $props: FloatContentProps
    $slots: {
      default(props: FloatContentSlotProps): any
    }
  }
}

export interface FloatArrowProps extends Pick<FloatProps, 'as'> {
  offset?: number
}

export const FloatArrowPropsValidators = {
  as: {
    ...FloatPropsValidators.as,
    default: 'div',
  },
  offset: {
    type: Number,
    default: 4,
  },
}

export interface FloatArrowSlotProps {
  placement: Placement
}

export const FloatArrow = {
  name: 'FloatArrow',
  props: FloatArrowPropsValidators,
  setup(props: FloatArrowProps, { slots, attrs }: SetupContext) {
    const { ref, placement, x, y } = useArrowContext('FloatArrow')

    return () => {
      const staticSide = {
        top: 'bottom',
        right: 'left',
        bottom: 'top',
        left: 'right',
      }[placement.value.split('-')[0]]!

      const style = {
        left: typeof x.value === 'number' ? `${x.value}px` : undefined,
        top: typeof y.value === 'number' ? `${y.value}px` : undefined,
        right: undefined,
        bottom: undefined,
        [staticSide]: `${props.offset! * -1}px`,
      }

      if (props.as === 'template') {
        const slot: FloatArrowSlotProps = {
          placement: placement.value,
        }

        const node = slots.default?.(slot)[0]

        if (!node || !isValidElement(node)) return

        return cloneVNode(node, { ref, style })
      }

      return h(props.as!, mergeProps(attrs, { ref, style }))
    }
  },
} as unknown as {
  new (): {
    $props: FloatArrowProps
    $slots: {
      default(props: FloatArrowSlotProps): any
    }
  }
}

export interface FloatVirtualProps<FloatingElement = HTMLElement> extends Pick<FloatProps, 'as' | 'show' | 'placement' | 'strategy' | 'offset' | 'shift' | 'flip' | 'arrow' | 'autoPlacement' | 'hide' | 'autoUpdate' | 'zIndex' | 'transitionName' | 'transitionType' | 'enter' | 'enterFrom' | 'enterTo' | 'leave' | 'leaveFrom' | 'leaveTo' | 'originClass' | 'tailwindcssOriginClass' | 'portal' | 'transform' | 'middleware' | 'onShow' | 'onHide' | 'onUpdate'> {
  onInitial?: (props: FloatVirtualInitialProps<FloatingElement>) => any
}

export const FloatVirtualPropsValidators = {
  as: FloatPropsValidators.as,
  show: FloatPropsValidators.show,
  placement: FloatPropsValidators.placement,
  strategy: FloatPropsValidators.strategy,
  offset: FloatPropsValidators.offset,
  shift: FloatPropsValidators.shift,
  flip: FloatPropsValidators.flip,
  arrow: FloatPropsValidators.arrow,
  autoPlacement: FloatPropsValidators.autoPlacement,
  hide: FloatPropsValidators.hide,
  autoUpdate: FloatPropsValidators.autoUpdate,
  zIndex: FloatPropsValidators.zIndex,
  transitionName: FloatPropsValidators.transitionName,
  transitionType: FloatPropsValidators.transitionType,
  enter: FloatPropsValidators.enter,
  enterFrom: FloatPropsValidators.enterFrom,
  enterTo: FloatPropsValidators.enterTo,
  leave: FloatPropsValidators.leave,
  leaveFrom: FloatPropsValidators.leaveFrom,
  leaveTo: FloatPropsValidators.leaveTo,
  originClass: FloatPropsValidators.originClass,
  tailwindcssOriginClass: FloatPropsValidators.tailwindcssOriginClass,
  portal: FloatPropsValidators.portal,
  transform: FloatPropsValidators.transform,
  middleware: FloatPropsValidators.middleware,
}

export interface FloatVirtualSlotProps {
  placement: Placement
  close: () => void
}

export interface FloatVirtualInitialProps<FloatingElement = HTMLElement> {
  show: Ref<boolean>
  placement: Readonly<Ref<Placement>>
  reference: Ref<VirtualElement>
  floating: Ref<FloatingElement | null>
}

export const FloatVirtual = {
  name: 'FloatVirtual',
  inheritAttrs: false,
  props: FloatVirtualPropsValidators,
  emits: ['initial', 'show', 'hide', 'update'],
  setup(props: FloatVirtualProps, { emit, slots, attrs }: SetupContext<['initial', 'show', 'hide', 'update']>) {
    const show = ref(props.show ?? false)
    const reference = ref({
      getBoundingClientRect() {
        return {
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          bottom: 0,
          right: 0,
          width: 0,
          height: 0,
        }
      },
    }) as Ref<VirtualElement>
    const floating = ref(null) as Ref<HTMLElement | null>

    const {
      floatingApi,
      placement,
      enterActiveClassRef,
      leaveActiveClassRef,
    } = useFloat(show, reference, floating, props, emit)

    watch(() => props.show, () => {
      show.value = props.show ?? false
    })

    function close() {
      show.value = false
    }

    emit('initial', {
      show,
      placement,
      reference,
      floating,
    } as FloatVirtualInitialProps)

    return () => {
      if (!slots.default) return

      const slot: FloatVirtualSlotProps = {
        placement: placement.value,
        close,
      }

      const [floatingNode] = flattenFragment(slots.default(slot)).filter(isValidElement)

      return renderFloatingElement(
        floatingNode,
        {
          as: props.as!,
          show: show.value,
          enterActiveClassRef,
          leaveActiveClassRef,
        },
        attrs,
        floatingApi
      )
    }
  },
} as unknown as {
  new (): {
    $props: FloatVirtualProps<any>
    $slots: {
      default(props: FloatVirtualSlotProps): any
    }
  }
}

export interface FloatContextMenuProps extends Omit<FloatVirtualProps, 'show' | 'portal'> {}

export const FloatContextMenuPropsValidators = {
  as: FloatPropsValidators.as,
  placement: FloatPropsValidators.placement,
  strategy: FloatPropsValidators.strategy,
  offset: FloatPropsValidators.offset,
  shift: FloatPropsValidators.shift,
  flip: {
    ...FloatPropsValidators.flip,
    default: true,
  },
  arrow: FloatPropsValidators.arrow,
  autoPlacement: FloatPropsValidators.autoPlacement,
  hide: FloatPropsValidators.hide,
  autoUpdate: FloatPropsValidators.autoUpdate,
  zIndex: FloatPropsValidators.zIndex,
  transitionName: FloatPropsValidators.transitionName,
  transitionType: FloatPropsValidators.transitionType,
  enter: FloatPropsValidators.enter,
  enterFrom: FloatPropsValidators.enterFrom,
  enterTo: FloatPropsValidators.enterTo,
  leave: FloatPropsValidators.leave,
  leaveFrom: FloatPropsValidators.leaveFrom,
  leaveTo: FloatPropsValidators.leaveTo,
  originClass: FloatPropsValidators.originClass,
  tailwindcssOriginClass: FloatPropsValidators.tailwindcssOriginClass,
  transform: FloatPropsValidators.transform,
  middleware: FloatPropsValidators.middleware,
}

export const FloatContextMenu = {
  name: 'FloatContextMenu',
  inheritAttrs: false,
  props: FloatContextMenuPropsValidators,
  emits: ['show', 'hide', 'update'],
  setup(props: FloatContextMenuProps, { emit, slots, attrs }: SetupContext<['show', 'hide', 'update']>) {
    function onInitial({ show, reference, floating }: FloatVirtualInitialProps) {
      useDocumentEvent('contextmenu', e => {
        e.preventDefault()

        reference.value = {
          getBoundingClientRect() {
            return {
              width: 0,
              height: 0,
              x: e.clientX,
              y: e.clientY,
              top: e.clientY,
              left: e.clientX,
              right: e.clientX,
              bottom: e.clientY,
            }
          },
        }

        show.value = true
      })

      useOutsideClick(floating, () => {
        show.value = false
      }, computed(() => show.value))
    }

    return () => {
      if (!slots.default) return

      return h(FloatVirtual, {
        ...props,
        ...attrs,
        portal: true,
        onInitial,
        onShow: () => emit('show'),
        onHide: () => emit('hide'),
        onUpdate: () => emit('update'),
      }, slots.default)
    }
  },
} as unknown as {
  new (): {
    $props: FloatContextMenuProps
    $slots: {
      default(props: FloatVirtualSlotProps): any
    }
  }
}

export interface FloatCursorProps extends Omit<FloatVirtualProps, 'show' | 'portal'> {
  globalHideCursor?: boolean
}

export const FloatCursorPropsValidators = {
  as: FloatPropsValidators.as,
  placement: FloatPropsValidators.placement,
  strategy: FloatPropsValidators.strategy,
  offset: FloatPropsValidators.offset,
  shift: FloatPropsValidators.shift,
  flip: FloatPropsValidators.flip,
  arrow: FloatPropsValidators.arrow,
  autoPlacement: FloatPropsValidators.autoPlacement,
  hide: FloatPropsValidators.hide,
  autoUpdate: FloatPropsValidators.autoUpdate,
  zIndex: FloatPropsValidators.zIndex,
  transitionName: FloatPropsValidators.transitionName,
  transitionType: FloatPropsValidators.transitionType,
  enter: FloatPropsValidators.enter,
  enterFrom: FloatPropsValidators.enterFrom,
  enterTo: FloatPropsValidators.enterTo,
  leave: FloatPropsValidators.leave,
  leaveFrom: FloatPropsValidators.leaveFrom,
  leaveTo: FloatPropsValidators.leaveTo,
  originClass: FloatPropsValidators.originClass,
  tailwindcssOriginClass: FloatPropsValidators.tailwindcssOriginClass,
  transform: FloatPropsValidators.transform,
  middleware: FloatPropsValidators.middleware,
  globalHideCursor: {
    type: Boolean,
    default: true,
  },
}

export const FloatCursor = {
  name: 'FloatCursor',
  inheritAttrs: false,
  props: FloatCursorPropsValidators,
  emits: ['show', 'hide', 'update'],
  setup({ globalHideCursor, ...props }: FloatCursorProps, { emit, slots, attrs }: SetupContext<['show', 'hide', 'update']>) {
    function onInitial({ show, reference, floating }: FloatVirtualInitialProps) {
      function open() {
        show.value = true
      }
      function close() {
        show.value = false
      }

      function setPosition(position: { clientX: number, clientY: number }) {
        reference.value = {
          getBoundingClientRect() {
            return {
              width: 0,
              height: 0,
              x: position.clientX,
              y: position.clientY,
              top: position.clientY,
              left: position.clientX,
              right: position.clientX,
              bottom: position.clientY,
            }
          },
        }
      }

      function onMouseMove(e: MouseEvent) {
        open()
        setPosition(e)
      }

      function onTouchMove(e: TouchEvent) {
        open()
        setPosition(e.touches[0])
      }

      const ownerDocument = getOwnerDocument(floating)
      if (!ownerDocument) return

      watchEffect(onInvalidate => {
        if (globalHideCursor &&
            !ownerDocument.getElementById('headlesui-float-cursor-style')
        ) {
          const style = ownerDocument.createElement('style')
          const head = ownerDocument.head || ownerDocument.getElementsByTagName('head')[0]
          head.appendChild(style)
          style.id = 'headlesui-float-cursor-style'
          style.appendChild(ownerDocument.createTextNode([
            '*, *::before, *::after {',
            '  cursor: none !important;',
            '}',
            '.headlesui-float-cursor-root {',
            '  pointer-events: none !important;',
            '}',
          ].join('\n')))

          onInvalidate(() => ownerDocument.getElementById('headlesui-float-cursor-style')?.remove())
        }
      }, { flush: 'post' })

      if (('ontouchstart' in window) || (navigator.maxTouchPoints > 0)) {
        useDocumentEvent('touchstart', onTouchMove)
        useDocumentEvent('touchend', close)
        useDocumentEvent('touchmove', onTouchMove)
      } else {
        useDocumentEvent('mouseenter', onMouseMove)
        useDocumentEvent('mouseleave', close)
        useDocumentEvent('mousemove', onMouseMove)
      }
    }

    return () => {
      if (!slots.default) return

      return h(FloatVirtual, {
        ...props,
        ...attrs,
        portal: true,
        class: 'headlesui-float-cursor-root',
        onInitial,
        onShow: () => emit('show'),
        onHide: () => emit('hide'),
        onUpdate: () => emit('update'),
      }, slots.default)
    }
  },
} as unknown as {
  new (): {
    $props: FloatCursorProps
    $slots: {
      default(props: FloatVirtualSlotProps): any
    }
  }
}
