declare module '*.module.scss' {
	const classes: { [key: string]: string }
	export default classes
}

declare module '*.scss' {
	const classes: { [key: string]: string }
	export default classes
}

declare module '*.css' {
	const classes: { [key: string]: string }
	export default classes
}

declare module '*.css?raw' {
	const content: string
	export default content
}

declare module '*.scss?raw' {
	const content: string
	export default content
}