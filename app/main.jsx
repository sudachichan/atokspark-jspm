import * as React from 'react';
import * as ReactDOM from 'react-dom';

class PluginManager extends React.Component {
    render() {
        return (
            <div>
                <h1>JavaScriptプラグインマネージャ for ATOK Spark</h1>
            </div>
        );
    }
}
ReactDOM.render(
    <PluginManager />,
    document.getElementById('content')
);