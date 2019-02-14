const presets = [
	[
		'@babel/env',
		{
			targets: {
				ie: '11',
				firefox: '60',
				chrome: '67',
				safari: '10'
			},
			modules: false,
			useBuiltIns: 'usage'
		}
	],
	// Uncomment if you need react presets also
	// '@babel/react'
];

const plugins = [
    '@babel/plugin-proposal-object-rest-spread',
    '@babel/plugin-syntax-dynamic-import',
    '@babel/plugin-proposal-class-properties',
]

module.exports = { presets , plugins };